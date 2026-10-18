// TEST ONLY. A loopback server with disposable accounts, PostgreSQL, and a small
// Auth/PostgREST facade. The production app never loads this file.
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const { resolve } = require("node:path");
const { users, createTestDatabase, asUser } = require("./fixtures.cjs");

const password = "notebook-test-only";
const signupPasswords = new Map();
const root = resolve(__dirname, "..");
// Serve the production build so browser checks exercise the shipped React app.
const buildRoot = resolve(root, 'dist');

const columns = {
    teams: ["id", "name"],
    team_members: ["user_id", "team_id", "display_name", "role"],
    documents: ["id", "team_id", "title", "mechanism", "content", "author_id", "updated_by", "created_at", "updated_at", "revision", "archived"]
};
columns.team_items = ["id", "team_id", "kind", "title", "data", "archived", "author_id", "updated_by", "created_at", "updated_at", "revision"];
columns.team_invites = ["id", "token", "team_id", "email", "role", "invited_by", "created_at", "expires_at", "revoked_at", "accepted_at", "accepted_by"];

function json(response, status, body) {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(body));
}

async function readJson(request) {
    let body = "";
    for await (const chunk of request) {
        body += chunk;
        if (body.length > 2_000_000) throw new Error("Test request too large");
    }
    return body ? JSON.parse(body) : {};
}

function authResponse(user) {
    const now = Math.floor(Date.now() / 1000);
    const part = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = part({ alg: "HS256", typ: "JWT" }) + "." +
        part({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 }) +
        "." + Buffer.from("test-only-signature").toString("base64url");
    return {
        access_token: token, refresh_token: "test-refresh-" + user.id,
        token_type: "bearer", expires_in: 3600, expires_at: now + 3600,
        user: {
            id: user.id, aud: "authenticated", role: "authenticated", email: user.email,
            email_confirmed_at: new Date().toISOString(),
            app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {},
            identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }
    };
}

function requestUser(request) {
    try {
        const token = (request.headers.authorization || "").replace(/^Bearer /i, "");
        const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
        return users.find(user => user.id === claims.sub) || null;
    } catch { return null; }
}

(async () => {
    const deployment = JSON.parse(await readFile(resolve(root, "vercel.json"), "utf8"));
    const securityHeaders = deployment.headers[0].headers;
    const { db } = await createTestDatabase();
    await db.exec(await readFile(resolve(root, "supabase/delete-archived.sql"), "utf8"));
    await db.exec(await readFile(resolve(root, "supabase/team-invitations.sql"), "utf8"));
    let failNextSave = false;
    let delayNextSave = 0;
    const server = http.createServer(async (request, response) => {
        const url = new URL(request.url, "http://localhost");
        // Browser tests enforce the same policy that Vercel will send in production.
        for (const header of securityHeaders) response.setHeader(header.key, header.value);
        try {
            if (url.pathname === '/test-config.js') {
                response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
                response.end("window.__NOTEBOOK_CONFIG__={url:location.origin+'/mock-supabase',key:'test-only-publishable-key',captchaSiteKey:"
                    + JSON.stringify(url.searchParams.has("captcha") ? "test-sitekey" : "") + "};");
                return;
            }
            if (url.pathname === '/' || url.pathname === '/index.html') {
                const html = await readFile(resolve(buildRoot, 'index.html'), 'utf8');
                // Generic tests omit the widget; dedicated CAPTCHA tests mock its SDK.
                const settings = '<script src="/test-config.js' + (url.searchParams.has("captcha") ? '?captcha=1' : '') + '"></script>';
                response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
                response.end(html.replace('<head>', '<head>' + settings));
                return;
            }
            if (/^\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(url.pathname)) {
                response.writeHead(200, { 'Content-Type': url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript' });
                response.end(await readFile(resolve(buildRoot, '.' + url.pathname)));
                return;
            }
            if (url.pathname === "/test-state") {
                json(response, 200, (await db.query("select id,title,mechanism,content,author_id,updated_by,revision from public.documents order by created_at")).rows);
                return;
            }
            if (url.pathname === "/test/fail-next-save" && request.method === "POST") {
                failNextSave = true;
                json(response, 200, { ready: true });
                return;
            }
            if (url.pathname === "/test/delay-next-save" && request.method === "POST") {
                delayNextSave = 1500;
                json(response, 200, { ready: true });
                return;
            }
            if (url.pathname === "/mock-supabase/auth/v1/signup") {
                const body = await readJson(request);
                if (users.some(user => user.email === body.email)) {
                    json(response, 422, { msg: "User already registered" });
                    return;
                }
                const user = { id: randomUUID(), email: body.email, name: "New account" };
                await db.query("insert into auth.users(id,email) values ($1,$2)", [user.id, user.email]);
                users.push(user);
                signupPasswords.set(user.id, body.password);
                json(response, 200, authResponse(user));
                return;
            }
            if (url.pathname === "/mock-supabase/auth/v1/token") {
                const body = await readJson(request);
                const user = url.searchParams.get("grant_type") === "refresh_token"
                    ? users.find(item => body.refresh_token === "test-refresh-" + item.id)
                    : users.find(item => item.email === body.email && body.password === (signupPasswords.get(item.id) || password));
                json(response, user ? 200 : 400, user ? authResponse(user) : { code: "invalid_credentials", msg: "Invalid login credentials" });
                return;
            }
            if (url.pathname === "/mock-supabase/auth/v1/logout") {
                json(response, 200, {});
                return;
            }
            if (url.pathname === "/mock-supabase/auth/v1/user") {
                const user = requestUser(request);
                json(response, user ? 200 : 401, user ? authResponse(user).user : { msg: "Not signed in" });
                return;
            }
            if (!url.pathname.startsWith("/mock-supabase/rest/v1/")) {
                json(response, 404, { message: "Not found" });
                return;
            }
            if (url.pathname === "/mock-supabase/rest/v1/rpc/create_team") {
                const body = await readJson(request);
                const user = requestUser(request);
                const result = await asUser(db, user?.id || null,
                    "select public.create_team($1,$2) as id", [body.team_name, body.member_name]);
                json(response, 200, result.rows[0].id);
                return;
            }
            const teamRpc = {
                create_team_invite: ["select public.create_team_invite($1,$2) as value", ["invite_email", "invite_role"]],
                revoke_team_invite: ["select public.revoke_team_invite($1) as value", ["invite_id"]],
                accept_team_invite: ["select public.accept_team_invite($1,$2) as value", ["invite_token", "member_name"]],
                set_team_member_role: ["select public.set_team_member_role($1,$2,$3) as value", ["member_id", "new_role", "expected_role"]],
                remove_team_member: ["select public.remove_team_member($1,$2) as value", ["member_id", "expected_role"]],
            };
            const rpcName = url.pathname.startsWith("/mock-supabase/rest/v1/rpc/") && url.pathname.split("/").pop();
            if (Object.hasOwn(teamRpc, rpcName)) {
                const body = await readJson(request);
                const user = requestUser(request);
                const [sql, fields] = teamRpc[rpcName];
                const result = await asUser(db, user?.id || null, sql, fields.map(field => body[field]));
                json(response, 200, result.rows[0].value);
                return;
            }
            const table = url.pathname.split("/").pop();
            if (!columns[table]) throw new Error("Unknown test table");
            const selected = (url.searchParams.get("select") || "*").split(",");
            if (selected.some(column => column !== "*" && !columns[table].includes(column))) throw new Error("Unknown test column");
            const projection = selected.join(",");
            const params = [];
            const conditions = [];
            for (const [name, value] of url.searchParams) {
                if (columns[table].includes(name) && value.startsWith("eq.")) {
                    params.push(value.slice(3));
                    conditions.push(name + "=$" + params.length);
                }
            }
            const where = conditions.length ? " where " + conditions.join(" and ") : "";
            let sql;
            if (request.method === "GET") {
                sql = "select " + projection + " from public." + table + where;
                if (url.searchParams.get("order") === "updated_at.desc") sql += " order by updated_at desc";
                if (url.searchParams.get("order") === "created_at.desc") sql += " order by created_at desc";
            } else if (request.method === "DELETE" && ["documents", "team_items"].includes(table)) {
                sql = "delete from public." + table + where + " returning " + projection;
            } else if (["POST", "PATCH"].includes(request.method) && ["documents", "team_items"].includes(table)) {
                const body = await readJson(request);
                if (failNextSave) {
                    failNextSave = false;
                    json(response, 503, { code: "TEST_SAVE_FAILURE", message: "Temporary test save failure" });
                    return;
                }
                if (delayNextSave) {
                    const delay = delayNextSave;
                    delayNextSave = 0;
                    await new Promise(done => setTimeout(done, delay));
                }
                const fields = Object.keys(body);
                if (fields.some(field => !columns[table].includes(field))) throw new Error("Unknown write column");
                const expressions = fields.map(field => {
                    params.push(typeof body[field] === "object" ? JSON.stringify(body[field]) : body[field]);
                    return "$" + params.length;
                });
                sql = request.method === "POST"
                    ? "insert into public." + table + "(" + fields.join(",") + ") values (" + expressions.join(",") + ")"
                    : "update public." + table + " set " + fields.map((field, index) => field + "=" + expressions[index]).join(",") + where;
                sql += " returning " + projection;
            } else {
                json(response, 405, { message: "Unsupported test method" });
                return;
            }
            const user = requestUser(request);
            const result = await asUser(db, user?.id || null, sql, params);
            const singular = (request.headers.accept || "").includes("application/vnd.pgrst.object+json");
            if (singular && result.rows.length !== 1) {
                json(response, 406, { code: "PGRST116", message: "Expected one row", details: "The result contains " + result.rows.length + " rows" });
            } else {
                json(response, request.method === "POST" ? 201 : 200, singular ? result.rows[0] : result.rows);
            }
        } catch (error) {
            json(response, error.code === "42501" ? 403 : 400, { code: error.code || "TEST_ERROR", message: error.message });
        }
    });
    server.listen(Number(process.env.TEST_PORT || 0), "127.0.0.1", () => {
        console.log("TEST_ONLY_URL=http://localhost:" + server.address().port);
        console.log("TEST_ONLY_PID=" + process.pid);
        console.log("Disposable login: sam@example.test or taylor@example.test / " + password);
    });
})().catch(error => { console.error(error); process.exitCode = 1; });
