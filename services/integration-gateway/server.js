import "dotenv/config";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

const app = express();
const port = Number(process.env.PORT || 8100);
const jwtSecret = process.env.JWT_SECRET || "replace-in-production";
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/lexora";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const integrationUserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["admin", "police", "investigator", "court_officer"], required: true },
}, { timestamps: true });
const IntegrationUser = mongoose.model("IntegrationUser", integrationUserSchema);

function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ detail: "Bearer token required" });
  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ detail: "Invalid or expired token" });
  }
}

app.get("/health", (_req, res) => res.json({
  status: "healthy",
  service: "lexora-node-integration-gateway",
  mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  features: ["express", "mongodb", "bcrypt", "jwt"],
}));

app.post("/auth/register", async (req, res, next) => {
  try {
    const { email, password, role = "investigator" } = req.body;
    if (!email || !password || password.length < 8) return res.status(400).json({ detail: "Email and 8-character password required" });
    if (!["admin", "police", "investigator", "court_officer"].includes(role)) return res.status(400).json({ detail: "Unsupported role" });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await IntegrationUser.create({ email, passwordHash, role });
    return res.status(201).json({ id: user.id, email: user.email, role: user.role });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ detail: "Account already exists" });
    return next(error);
  }
});

app.post("/auth/login", async (req, res, next) => {
  try {
    const user = await IntegrationUser.findOne({ email: req.body.email?.toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body.password || "", user.passwordHash))) return res.status(401).json({ detail: "Invalid email or password" });
    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret, { expiresIn: "8h" });
    return res.json({ access_token: token, token_type: "bearer", user: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/me", auth, (req, res) => res.json(req.user));
app.use((error, _req, res, _next) => res.status(500).json({ detail: error.message || "Integration gateway error" }));

mongoose.connect(mongoUri)
  .then(() => app.listen(port, "0.0.0.0", () => console.log(`LEXORA Node gateway listening on http://127.0.0.1:${port}`)))
  .catch((error) => {
    console.error(`MongoDB connection failed: ${error.message}`);
    process.exitCode = 1;
  });
