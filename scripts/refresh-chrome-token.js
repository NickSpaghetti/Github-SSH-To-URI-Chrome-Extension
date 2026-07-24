#!/usr/bin/env node
// Regenerates the Chrome Web Store OAuth refresh token used by the release
// workflow, and optionally pushes it straight to the GitHub Actions secret.
//
// Required in .env: CHROME_CLIENT_ID, CHROME_CLIENT_SECRET
// Invoke via: make refresh-chrome-token

"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const readline = require("readline");
const { spawn, spawnSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT_DIR, ".env");
const SCOPE = "https://www.googleapis.com/auth/chromewebstore";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALLBACK_TIMEOUT_MS = 120_000;

function upsertEnvValue(filePath, key, value) {
    const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split("\n") : [];
    const pattern = new RegExp(`^${key}=`);
    let found = false;
    const updated = lines.map((line) => {
        if (pattern.test(line)) {
            found = true;
            return `${key}=${value}`;
        }
        return line;
    });
    if (!found) {
        if (updated.length && updated[updated.length - 1] !== "") {
            updated.push("");
        }
        updated[updated.length - 1] = `${key}=${value}`;
    }
    fs.writeFileSync(filePath, updated.join("\n"));
}

const BROWSER_OPENERS = {
    darwin: { command: "open", args: [] },
    win32: {
        command: "powershell",
        args: ["-NoProfile", "-NonInteractive", "-Command", "Start-Process", "-FilePath"],
    },
};

function openInBrowser(url) {
    const opener = BROWSER_OPENERS[process.platform];
    if (!opener) {
        console.warn(`Unsupported platform ${process.platform}; use the URL printed above.`);
        return;
    }
    try {
        spawn(opener.command, [...opener.args, url], { stdio: "ignore", detached: true }).unref();
    } catch (err) {
        console.warn(`Could not auto-open browser (${err.message}); use the URL printed above.`);
    }
}

function waitForAuthCode(port) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, `http://127.0.0.1:${port}`);
            const code = url.searchParams.get("code");
            const error = url.searchParams.get("error");
            const message = code
                ? "Authorized. You may close this tab and return to the terminal."
                : `Authorization failed: ${error || "unknown error"}`;

            res.writeHead(200, { "Content-Type": "text/html", Connection: "close" });
            res.end(`<html><body><h2>${message}</h2></body></html>`);

            res.on("finish", () => {
                clearTimeout(timer);
                server.close();
                if (code) {
                    resolve(code);
                } else {
                    reject(new Error(error || "Authorization denied"));
                }
            });
        });

        const timer = setTimeout(() => {
            server.close();
            reject(new Error("Timed out waiting for the OAuth redirect"));
        }, CALLBACK_TIMEOUT_MS);
        timer.unref();

        server.listen(port, "127.0.0.1");
    });
}

function prompt(question) {
    const readLine = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) =>
        readLine.question(question, (answer) => {
            readLine.close();
            resolve(answer);
        }),
    );
}

async function main() {
    if (!fs.existsSync(ENV_FILE)) {
        console.error(
            `Missing ${ENV_FILE}. Create one with CHROME_CLIENT_ID and CHROME_CLIENT_SECRET set.`,
        );
        process.exit(1);
    }

    process.loadEnvFile(ENV_FILE);
    const clientId = process.env.CHROME_CLIENT_ID;
    const clientSecret = process.env.CHROME_CLIENT_SECRET;

    if (!clientId) {
        console.error("Set CHROME_CLIENT_ID in .env");
        process.exit(1);
    }
    if (!clientSecret) {
        console.error("Set CHROME_CLIENT_SECRET in .env");
        process.exit(1);
    }

    // Google retired the OOB (urn:ietf:wg:oauth:2.0:oob) flow, so a Desktop-app
    // OAuth client needs a loopback redirect instead: we run a one-shot local
    // HTTP listener to catch the ?code= Google sends back.
    const server = http.createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));

    const redirectUri = `http://127.0.0.1:${port}`;
    const authUrl =
        `https://accounts.google.com/o/oauth2/auth?response_type=code&scope=${encodeURIComponent(SCOPE)}` +
        `&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    console.log("Opening consent screen in your browser. Log in with the account that has");
    console.log("publish access on the Chrome Web Store Developer Dashboard.");
    console.log();
    console.log(authUrl);
    console.log();

    openInBrowser(authUrl);

    console.log(`Waiting for the redirect back to ${redirectUri} (2 minute timeout)...`);
    let authCode;
    try {
        authCode = await waitForAuthCode(port);
    } catch (err) {
        console.error(`No authorization code received: ${err.message}`);
        process.exit(1);
    }

    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: authCode,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
        }),
    });
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
        console.error(
            `Token exchange failed: ${tokenData.error} - ${tokenData.error_description || ""}`,
        );
        process.exit(1);
    }
    if (!tokenData.refresh_token) {
        console.error("No refresh_token in response. Full response:");
        console.error(JSON.stringify(tokenData, null, 2));
        process.exit(1);
    }

    const refreshToken = tokenData.refresh_token;
    console.log();
    console.log("New refresh token obtained.");

    upsertEnvValue(ENV_FILE, "CHROME_REFRESH_TOKEN", refreshToken);
    console.log(`Updated CHROME_REFRESH_TOKEN in ${ENV_FILE}`);

    const ghCheck = spawnSync("gh", ["--version"], { stdio: "ignore" });
    if (ghCheck.status === 0) {
        const answer = await prompt(
            "Push CHROME_REFRESH_TOKEN to the GitHub Actions secret now? [y/N] ",
        );
        if (/^y(es)?$/i.test(answer.trim())) {
            const result = spawnSync(
                "gh",
                [
                    "secret",
                    "set",
                    "CHROME_REFRESH_TOKEN",
                    "--repo",
                    "NickSpaghetti/Github-SSH-To-URI-Chrome-Extension",
                ],
                { input: refreshToken, stdio: ["pipe", "inherit", "inherit"] },
            );
            if (result.status === 0) {
                console.log("GitHub secret CHROME_REFRESH_TOKEN updated.");
            } else {
                console.error("Failed to update GitHub secret; update it manually.");
                process.exit(1);
            }
        }
    } else {
        console.log("gh CLI not found; update the CHROME_REFRESH_TOKEN secret manually.");
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
