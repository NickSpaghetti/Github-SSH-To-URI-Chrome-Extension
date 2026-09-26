import { BrowserCdp } from "./BrowserCdp";

export type Request = { url: string; start: number; end: number };

/**
 * Registry lookups are http requests, so the harness counts them at the
 * network rather than through an instrument in the extension. This measures
 * what actually went out instead of the extension's own account of it.
 */
export class NetworkWatch {
    private readonly started = new Map<string, { url: string; start: number }>();
    private readonly finished: Request[] = [];

    private constructor(private readonly cdp: BrowserCdp) {}

    /**
     * @param cdp a browser level client
     * @param session a session attached to the target making the requests
     * @returns a watch that is already recording
     */
    public static async openAsync(cdp: BrowserCdp, session: string): Promise<NetworkWatch> {
        const watch = new NetworkWatch(cdp);
        cdp.onEvent((method, params) => watch.receive(method, params));
        await cdp.sendAsync("Network.enable", {}, session);
        return watch;
    }

    /**
     * @param host only requests to this host
     * @returns each request, with when it started and finished
     */
    public requestsTo(host: string): Request[] {
        return this.finished.filter((request) => request.url.includes(host));
    }

    private receive(method: string, params: Record<string, unknown>): void {
        if (method === "Network.requestWillBeSent") {
            const request = params.request as { url: string } | undefined;
            if (request !== undefined) {
                this.started.set(String(params.requestId), {
                    url: request.url,
                    start: Number(params.timestamp) * 1000,
                });
            }
            return;
        }
        if (method !== "Network.loadingFinished" && method !== "Network.loadingFailed") {
            return;
        }
        const id = String(params.requestId);
        const began = this.started.get(id);
        if (began === undefined) {
            return;
        }
        this.started.delete(id);
        this.finished.push({
            url: began.url,
            start: began.start,
            end: Number(params.timestamp) * 1000,
        });
    }
}
