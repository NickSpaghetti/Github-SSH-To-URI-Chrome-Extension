export const SENDERS = {
    BACKGROUND: "background",
    POPUP: "popup",
} as const;

/** The background script asks the content script to refresh; it carries no tab. */
export type BackgroundRefresh = {
    readonly sender: typeof SENDERS.BACKGROUND;
};

/** The popup asks for the modules on a tab it names. */
export type PopupRequest = {
    readonly sender: typeof SENDERS.POPUP;
    readonly tabId: number;
    readonly tabUrl: string;
};

/**
 * What the background and popup scripts may send the content script. The
 * senders are typed against it and the guards in `TabMessageGuards` narrow
 * back to it, so the contract is checked at both ends rather than only on
 * arrival.
 */
export type TabMessage = BackgroundRefresh | PopupRequest;
