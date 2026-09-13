document.addEventListener("DOMContentLoaded", () => {
    const API = "/api";
    const tokenKey = "dms_token";
    const authResetVersion = "auth-reset-v1";
    if (localStorage.getItem("dms_auth_reset") !== authResetVersion) {
        localStorage.removeItem(tokenKey);
        localStorage.setItem("dms_auth_reset", authResetVersion);
    }
    const $ = (selector) => document.querySelector(selector);
    const token = () => localStorage.getItem(tokenKey);
    const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};

    async function api(path, options = {}) {
        const response = await fetch(`${API}${path}`, {
            ...options,
            headers: { ...headers(), ...(options.headers || {}) }
        });
        if (response.status === 401 && response.headers.get("X-MFA-Required") === "true") {
            const mfaError = new Error("MFA_REQUIRED");
            mfaError.mfaRequired = true;
            throw mfaError;
        }
        if (response.status === 401) {
            showAuth();
            throw new Error("Authentication required");
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Request failed");
        return data;
    }

    function showToast(message, error = false) {
        const toast = document.createElement("div");
        toast.className = `toast ${error ? "toast-error" : ""}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3200);
    }

    function showAuth() {
        let modal = $("#auth-modal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "auth-modal";
            modal.className = "modal-backdrop";
            modal.innerHTML = `<div class="auth-card">
                <button class="modal-close" aria-label="Close">×</button>
                <span class="eyebrow">SECURE WORKSPACE</span><h2>Sign in to NyayVault</h2>
                <p class="modal-copy">Access controlled legal and investigation records.</p>
                <form id="auth-form">
                    <input name="email" type="email" placeholder="Work email" value="" required>
                    <input name="password" type="password" placeholder="Password (8+ characters)" value="" required>
                    <input name="full_name" placeholder="Full name (for first-time setup)" value="Demo Investigator">
                    <button class="btn btn-primary" type="submit">Continue securely</button>
                </form>
                <button id="auth-mode" class="text-button">Create a new account</button>
                <small>Prototype mode: your data is stored locally in the backend database.</small>
            </div>`;
            document.body.appendChild(modal);
            modal.querySelector(".modal-close").onclick = () => modal.remove();
            let register = false;
            modal.querySelector("#auth-mode").onclick = (event) => {
                register = !register;
                event.target.textContent = register ? "I already have an account" : "Create a new account";
                modal.querySelector("[name=full_name]").style.display = register ? "block" : "none";
                modal.querySelector("h2").textContent = register ? "Create your secure account" : "Sign in to NyayVault";
            };
            modal.querySelector("[name=full_name]").style.display = "none";
            modal.querySelector("#auth-form").onsubmit = async (event) => {
                event.preventDefault();
                const values = Object.fromEntries(new FormData(event.target));
                try {
                    if (register) {
                        await api("/auth/register", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(values) });
                    }
                    let result;
                    try {
                        result = await api("/auth/login", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({email: values.email, password: values.password}) });
                    } catch (error) {
                        if (!error.mfaRequired) throw error;
                        const code = window.prompt("Enter the six-digit MFA code from your authenticator app:");
                        if (!code) throw new Error("MFA code is required");
                        result = await api("/auth/login", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({email: values.email, password: values.password, mfa_code: code}) });
                    }
                    localStorage.setItem(tokenKey, result.access_token);
                    modal.remove();
                    await refresh();
                    showToast(`Welcome back, ${result.user.full_name}`);
                } catch (error) { showToast(error.message, true); }
            };
        }
        modal.style.display = "grid";
    }

    async function refresh() {
        if (!token()) return showAuth();
        try {
            const [dashboard, documents] = await Promise.all([api("/dashboard"), api("/documents")]);
            document.querySelectorAll(".stat-number[data-target]").forEach((element, index) => {
                const values = [dashboard.total_documents, dashboard.active_cases, dashboard.integrity];
                element.dataset.target = values[index] || 0;
                element.textContent = Number(values[index] || 0).toLocaleString();
            });
            const name = $(".user-name");
            if (name) name.textContent = `${dashboard.user.full_name} · ${dashboard.user.role}`;
            const count = $(".section-count");
            if (count) count.textContent = `${documents.length} documents`;
            renderDocuments(documents);
            renderActivity(dashboard.activities);
        } catch (error) {
            if (error.message !== "Authentication required") showToast(error.message, true);
        }
    }

    function renderDocuments(documents) {
        let panel = $("#document-list");
        if (!panel) {
            panel = document.createElement("div");
            panel.id = "document-list";
            panel.className = "document-list";
            $(".features-section").appendChild(panel);
        }
        panel.innerHTML = documents.length ? documents.map((document) => `
            <article class="document-row">
                <div><span class="doc-type">${document.document_type}</span><h3>${escapeHtml(document.title)}</h3>
                <p>${escapeHtml(document.filename)} · SHA-256 ${document.sha256.slice(0, 12)}…</p></div>
                <a class="btn btn-sm btn-view-collab" href="${document.download_url}" target="_blank">Verify & download</a>
            </article>`).join("") : `<div class="empty-state">No documents yet. Upload a case record to begin.</div>`;
    }

    function renderActivity(activities = []) {
        const list = $(".activity-list");
        if (!list || !activities.length) return;
        list.innerHTML = activities.map((item) => `<div class="activity-item">
            <div class="activity-icon bg-green">◈</div><div class="activity-details">
            <div class="activity-title">${escapeHtml(item.action.replace(".", " · "))}</div>
            <div class="activity-meta">${escapeHtml(item.user)} · ${new Date(item.created_at).toLocaleString()}</div></div></div>`).join("");
    }

    function escapeHtml(value) {
        return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
    }

    const uploadBtn = $(".btn-upload");
    const fileInput = Object.assign(document.createElement("input"), { type: "file", accept: ".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt" });
    uploadBtn?.addEventListener("click", () => token() ? fileInput.click() : showAuth());
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        if (!file) return;
        const form = new FormData();
        form.append("document", file);
        form.append("title", file.name.replace(/\.[^.]+$/, ""));
        form.append("document_type", "investigation");
        try {
            await api("/documents/upload", { method: "POST", body: form });
            await refresh();
            showToast("Document secured and hash recorded");
        } catch (error) { showToast(error.message, true); }
        fileInput.value = "";
    });

    $(".btn-logout")?.addEventListener("click", () => { localStorage.removeItem(tokenKey); location.reload(); });
    document.querySelectorAll("a[href^='#']").forEach((anchor) => anchor.addEventListener("click", (event) => {
        event.preventDefault(); document.querySelector(anchor.getAttribute("href"))?.scrollIntoView({ behavior: "smooth" });
    }));
    refresh();
});
