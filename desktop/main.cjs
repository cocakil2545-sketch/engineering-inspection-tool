const { app, BrowserWindow, ipcMain, shell, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { machineIdSync } = require("node-machine-id");

const APP_ID = "com.inspectiq.desktop";
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAxmyMZjWTFAxfIgvNtvtiOAbra7Tqnl/+WoWZX/h6Wjk=
-----END PUBLIC KEY-----`;
const SINGLE_INSTANCE = app.requestSingleInstanceLock();
if (!SINGLE_INSTANCE) app.quit();

let mainWindow;
let deviceId;
let apiBaseUrl = "";

function readConfig() {
  try {
    const cfgPath = path.join(__dirname, "license-config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    apiBaseUrl = String(cfg.apiBaseUrl || "").replace(/\/$/, "");
  } catch (_) { apiBaseUrl = ""; }
}

function getDeviceId() {
  if (!deviceId) {
    const machine = machineIdSync(true);
    deviceId = crypto.createHash("sha256").update(APP_ID + ":" + machine).digest("hex");
  }
  return deviceId;
}

function licensePath() {
  return path.join(app.getPath("userData"), "license.dat");
}

function decodeCertificate(cert) {
  if (!cert || typeof cert !== "string") throw new Error("No activation certificate found.");
  const parts = cert.split(".");
  if (parts.length !== 2) throw new Error("Activation certificate format is invalid.");
  const payloadBytes = Buffer.from(parts[0], "base64url");
  const signature = Buffer.from(parts[1], "base64url");
  const valid = crypto.verify(null, Buffer.from(parts[0]), PUBLIC_KEY_PEM, signature);
  if (!valid) throw new Error("Activation certificate signature is invalid.");
  const payload = JSON.parse(payloadBytes.toString("utf8"));
  if (payload.deviceId !== getDeviceId()) throw new Error("This license belongs to another computer.");
  if (!Number.isFinite(payload.expiresAt) || Date.now() >= payload.expiresAt) {
    throw new Error("Your InspectIQ license has expired. Connect to the internet to renew.");
  }
  return payload;
}

function loadSavedLicense() {
  try {
    if (!fs.existsSync(licensePath())) return null;
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows secure storage is unavailable.");
    const encrypted = fs.readFileSync(licensePath());
    const cert = safeStorage.decryptString(encrypted);
    return decodeCertificate(cert);
  } catch (error) {
    return { invalid: true, message: error.message };
  }
}

function saveLicense(cert) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure Windows storage is unavailable; activation cannot be saved safely.");
  }
  decodeCertificate(cert);
  const encrypted = safeStorage.encryptString(cert);
  fs.writeFileSync(licensePath(), encrypted);
}

async function postApi(route, body) {
  if (!apiBaseUrl || apiBaseUrl.includes("YOUR-CLOUDFLARE-WORKER")) {
    throw new Error("The InspectIQ licensing server has not been configured yet.");
  }
  const response = await fetch(apiBaseUrl + route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Licensing server rejected the request.");
  return data;
}

ipcMain.handle("license:status", () => {
  const license = loadSavedLicense();
  if (!license) return { active: false, deviceId: getDeviceId() };
  if (license.invalid) return { active: false, error: license.message, deviceId: getDeviceId() };
  return {
    active: true,
    username: license.username,
    plan: license.plan,
    expiresAt: license.expiresAt,
    deviceId: getDeviceId()
  };
});

ipcMain.handle("license:activate", async (_event, form) => {
  const username = String(form?.username || "").trim();
  const password = String(form?.password || "");
  const licenseKey = String(form?.licenseKey || "").trim();
  if (!username || !password) throw new Error("Enter your username and password.");
  const data = await postApi("/api/activate", {
    username, password, licenseKey, deviceId: getDeviceId(),
    appVersion: app.getVersion()
  });
  if (!data.certificate) throw new Error("The licensing server did not return an activation certificate.");
  saveLicense(data.certificate);
  return { active: true, username: data.account?.username || username, plan: data.plan, expiresAt: data.expiresAt };
});

ipcMain.handle("license:renew", async () => {
  const license = loadSavedLicense();
  if (!license || license.invalid) throw new Error("Activate InspectIQ before renewing.");
  const data = await postApi("/api/renew", {
    licenseId: license.licenseId,
    deviceId: getDeviceId()
  });
  if (!data.certificate) throw new Error("Renewal did not return a valid certificate.");
  saveLicense(data.certificate);
  return { active: true, expiresAt: data.expiresAt, plan: data.plan };
});

ipcMain.handle("app:openExternal", async (_event, url) => {
  const parsed = new URL(String(url));
  if (parsed.protocol !== "https:") throw new Error("Only secure HTTPS links can be opened.");
  await shell.openExternal(parsed.toString());
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1000, minHeight: 700,
    backgroundColor: "#f4f7f5",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  readConfig();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("second-instance", () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
