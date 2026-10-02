/** A target the browser reports, such as a page or a service worker. */
export type CdpTarget = { targetId: string; type: string; url: string };

type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void };

/** A CDP client at the browser level, which can attach to a service worker. */
export class BrowserCdp {
    private readonly socket: WebSocket;
    private readonly pending = new Map<number, Pending>();
    private nextId = 1;

    private listener: ((method: string, params: Record<string, unknown>) => void) | null = null;

    private constructor(socket: WebSocket) {
        this.socket = socket;
        this.socket.addEventListener("message", (event) => this.receive(String(event.data)));
    }

    /**
     * Calls a listener for every protocol event.
     * @param listener Called with each event's method and parameters.
     */
    public onEvent(listener: (method: string, params: Record<string, unknown>) => void): void {
        this.listener = listener;
    }

    /**
     * Connects to a browser's debugging endpoint.
     * @param port The port Chrome was given as `--remote-debugging-port`.
     * @returns A client connected to the browser endpoint.
     */
    public static async connectAsync(port: number): Promise<BrowserCdp> {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        const { webSocketDebuggerUrl } = (await response.json()) as {
            webSocketDebuggerUrl: string;
        };
        const socket = new WebSocket(webSocketDebuggerUrl);
        await new Promise<void>((resolve, reject) => {
            socket.addEventListener("open", () => resolve(), { once: true });
            socket.addEventListener("error", () => reject(new Error("cdp socket failed")), {
                once: true,
            });
        });
        return new BrowserCdp(socket);
    }

    /**
     * Sends a CDP command and returns its result.
     * @param method A CDP method name.
     * @param params Its parameters.
     * @param sessionId The attached session to send it to, browser level when absent.
     * @returns Whatever the method returned.
     */
    public async sendAsync<T>(
        method: string,
        params: Record<string, unknown> = {},
        sessionId?: string,
    ): Promise<T> {
        const id = this.nextId;
        this.nextId += 1;
        const message = JSON.stringify(
            sessionId === undefined ? { id, method, params } : { id, method, params, sessionId },
        );
        return await new Promise<T>((resolve, reject) => {
            this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
            this.socket.send(message);
        });
    }

    /**
     * Returns every target the browser knows about.
     * @returns The targets.
     */
    public async targetsAsync(): Promise<CdpTarget[]> {
        const { targetInfos } = await this.sendAsync<{ targetInfos: CdpTarget[] }>(
            "Target.getTargets",
        );
        return targetInfos;
    }

    /**
     * Attaches to a target.
     * @param targetId The target to attach to.
     * @returns The session id to pass to `sendAsync`.
     */
    public async attachAsync(targetId: string): Promise<string> {
        const { sessionId } = await this.sendAsync<{ sessionId: string }>("Target.attachToTarget", {
            targetId,
            flatten: true,
        });
        return sessionId;
    }

    /** Closes the connection. */
    public close(): void {
        this.socket.close();
    }

    private receive(raw: string): void {
        const message = JSON.parse(raw) as {
            id?: number;
            result?: unknown;
            error?: { message: string };
        };
        if (message.id === undefined) {
            const event = message as unknown as {
                method?: string;
                params?: Record<string, unknown>;
            };
            if (event.method !== undefined && this.listener !== null) {
                this.listener(event.method, event.params ?? {});
            }
            return;
        }
        const waiting = this.pending.get(message.id);
        if (waiting === undefined) {
            return;
        }
        this.pending.delete(message.id);
        if (message.error !== undefined) {
            waiting.reject(new Error(message.error.message));
            return;
        }
        waiting.resolve(message.result);
    }
}
