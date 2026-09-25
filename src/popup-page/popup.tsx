import React, { FC, useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
    Container,
    CssBaseline,
    Link,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableFooter,
    TablePagination,
    TableRow,
    Typography,
} from "@mui/material";
import { DisplayModule } from "../types/DisplayModule";
import { toSourceTypeLabel } from "../types/SourceTypes";
import { TablePaginationActions } from "../components/TablePaginationComponent";
import { CACHE_KEYS, ChromeStorageCache } from "../services/ChromeStorageCache";
import { isSafeHttpUrl } from "../util/UrlSafety";
import { SENDERS, TabMessage } from "../types/TabMessage";
import { normalizeConstraint } from "../domain/VersionConstraint";

const RESOLVES_TO = "\u2192";

/**
 * Every cell is `nowrap`, so a row is always one line, and the table sizes to
 * its content rather than to the popup. The name is the only cell that can be
 * arbitrarily long, so it is the only one that ellipsizes: that cap is what
 * keeps the table inside the 800px Chrome allows a popup.
 */
const NAME_CELL = {
    whiteSpace: "nowrap",
    maxWidth: 460,
    overflow: "hidden",
    textOverflow: "ellipsis",
} as const;

const FITTED_CELL = { whiteSpace: "nowrap" } as const;

const versionSummary = (module: DisplayModule): string => {
    if (module.versionConstraint === "") {
        return "";
    }
    const constraint = normalizeConstraint(module.versionConstraint);
    if (module.resolvedVersion === "" || module.resolvedVersion === constraint) {
        return constraint;
    }
    return `${constraint} ${RESOLVES_TO} ${module.resolvedVersion}`;
};

/** The extension's popup: the modules on the current tab, and their links. */
export const Popup: FC = () => {
    const [content, setContent] = useState<DisplayModule[]>([]);
    const [rowsPerPage, setRowsPerPage] = useState(5);
    const [page, setPage] = useState(0);
    const [isFetching, setIsFetching] = useState(false);
    const storageCache = new ChromeStorageCache();

    useEffect(() => {
        const abortController = new AbortController();
        const signal = abortController.signal;

        const queryChromeTab = async (): Promise<chrome.tabs.Tab | undefined> => {
            const [tab] = await chrome.tabs.query({
                active: true,
                lastFocusedWindow: true,
            });
            return tab;
        };

        const sendMessage = async (
            currentTabId: number,
            message: TabMessage,
        ): Promise<DisplayModule[]> => {
            return await chrome.tabs.sendMessage(currentTabId, message);
        };

        const loadContentScript = async (tabId: number) => {
            return await chrome.scripting.executeScript({
                target: { tabId: tabId, allFrames: true },
                files: ["contentscript.js"],
            });
        };

        const fetchData = async () => {
            const cachedModules = await storageCache.getAsync<DisplayModule[]>(CACHE_KEYS.MODULES);
            if (cachedModules) {
                setContent(cachedModules);
                return;
            }
            if (isFetching) {
                return; // Prevent multiple fetches
            }
            setIsFetching(true);

            try {
                const tab = await queryChromeTab();
                if (!tab || !tab.id) {
                    return;
                }

                await loadContentScript(tab.id);
                const result = await sendMessage(tab.id, {
                    sender: SENDERS.POPUP,
                    tabId: tab.id,
                    tabUrl: tab.url || "",
                });

                if (Array.isArray(result) && result.length !== 0) {
                    setContent(result);
                }
            } catch (err) {
                if (signal.aborted) {
                    return;
                }
                console.error("Error fetching data:", err);
            } finally {
                setIsFetching(false);
            }
        };

        fetchData().catch((err) => {
            if (signal.aborted) {
                return; // Ignore aborted errors
            }
            console.error("Error fetching data:", err);
        });

        return () => {
            abortController.abort(); // Cleanup the abort controller
        };
    }, []); // Empty dependency array means this effect runs once on mount

    const emptyRows = page > 0 ? Math.max(0, (1 + page) * rowsPerPage - content.length) : 0;

    const changePageHandler = useCallback(
        (event: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
            setPage(newPage);
        },
        [],
    );

    const changeRowsPerPageHandler = useCallback(
        (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const newRowsPerPage = parseInt(event.target.value, 10);
            if (newRowsPerPage !== rowsPerPage) {
                setRowsPerPage(newRowsPerPage);
                setPage(0);
            }
        },
        [rowsPerPage],
    );

    return (
        <>
            <CssBaseline />
            <Container maxWidth={false} disableGutters sx={{ px: 1 }}>
                {content.length === 0 ? (
                    <Typography variant="h6">No Modules Found</Typography>
                ) : (
                    <TableContainer>
                        <Table sx={{ width: "auto" }} aria-label="Modules">
                            <TableBody>
                                {(rowsPerPage > 0
                                    ? content.slice(
                                          page * rowsPerPage,
                                          page * rowsPerPage + rowsPerPage,
                                      )
                                    : content
                                ).map((content) => (
                                    <TableRow key={content.moduleName}>
                                        <TableCell
                                            component="th"
                                            scope="row"
                                            sx={NAME_CELL}
                                            title={content.moduleName}
                                        >
                                            {content.resolvedUrl !== null &&
                                            isSafeHttpUrl(content.resolvedUrl) ? (
                                                <Link
                                                    target="_blank"
                                                    underline="always"
                                                    rel="noreferrer"
                                                    href={content.resolvedUrl}
                                                >
                                                    {content.moduleName}
                                                </Link>
                                            ) : (
                                                content.moduleName
                                            )}
                                        </TableCell>
                                        <TableCell component="th" scope="row" sx={FITTED_CELL}>
                                            {toSourceTypeLabel(content.sourceType)}
                                        </TableCell>
                                        <TableCell component="th" scope="row" sx={FITTED_CELL}>
                                            {versionSummary(content)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {emptyRows > 0 && (
                                    <TableRow style={{ height: 53 * emptyRows }}>
                                        <TableCell colSpan={3} />
                                    </TableRow>
                                )}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TablePagination
                                        rowsPerPageOptions={[5, 10, { label: "All", value: -1 }]}
                                        colSpan={3}
                                        count={content.length}
                                        rowsPerPage={rowsPerPage}
                                        page={page}
                                        SelectProps={{
                                            inputProps: {
                                                "aria-label": "rows per page",
                                            },
                                            native: true,
                                        }}
                                        onPageChange={changePageHandler}
                                        onRowsPerPageChange={changeRowsPerPageHandler}
                                        ActionsComponent={TablePaginationActions}
                                    />
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </TableContainer>
                )}
            </Container>
        </>
    );
};

const container = document.getElementById("sources-popup");
if (container !== null) {
    createRoot(container).render(<Popup />);
}
