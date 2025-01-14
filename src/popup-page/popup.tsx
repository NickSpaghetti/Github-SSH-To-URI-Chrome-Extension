import React, { FC, useEffect, useState, useCallback } from 'react';
import { render } from 'react-dom';
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
} from '@mui/material';
import { DisplayHlcModule } from '../models/DisplayHclModule';
import { SourceTypes } from '../types/SourceTypes';
import { TablePaginationActions } from '../components/TablePaginationComponent';
import { ChromeStorageCache } from '../services/ChromeStorageCache';
import { CacheKeys } from '../util/constants';

interface IProps {}

export const Popup: FC<IProps> = () => {
    const [content, setContent] = useState<DisplayHlcModule[]>([]);
    const [rowsPerPage, setRowsPerPage] = useState(5);
    const [page, setPage] = useState(0);
    const [isFetching, setIsFetching] = useState(false);
    const chromeStorageCahce = new ChromeStorageCache();

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
            message: any
        ): Promise<DisplayHlcModule[]> => {
            return await chrome.tabs.sendMessage(currentTabId, message);
        };

        const loadContentScript = async (tabId: number) => {
            return await chrome.scripting.executeScript({
                target: { tabId: tabId, allFrames: true },
                files: ['contentscript.js'],
            });
        };

        const fetchData = async () => {
            const cachedModules = await chromeStorageCahce.GetAsync<DisplayHlcModule[]>(CacheKeys.MODULES);
            if(cachedModules){
                setContent(cachedModules);
                return;
            }
            if (isFetching){
                return; // Prevent multiple fetches
            } 
            setIsFetching(true);

            try {
                const tab = await queryChromeTab();
                if (!tab || !tab.id) return;

                await loadContentScript(tab.id);
                const result = await sendMessage(tab.id, {
                    tabId: tab.id,
                    tabUrl: tab.url || '',
                });

                if (Array.isArray(result) && result.length !== 0) {
                    setContent(result);
                }
            } catch (err) {
                if (signal.aborted) {
                    return;
                }
                console.error('Error fetching data:', err);
            } finally {
                setIsFetching(false);
            }
        };

        fetchData().catch((err) => {
            if (signal.aborted) {
                return; // Ignore aborted errors
            }
            console.error('Error fetching data:', err);
        });

        return () => {
            abortController.abort(); // Cleanup the abort controller
        };
    }, []); // Empty dependency array means this effect runs once on mount

    const emptyRows =
        page > 0 ? Math.max(0, (1 + page) * rowsPerPage - content.length) : 0;

    const changePageHandler = useCallback(
        (event: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
            setPage(newPage);
        },
        []
    );

    const changeRowsPerPageHandler = useCallback(
        (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const newRowsPerPage = parseInt(event.target.value, 10);
            if (newRowsPerPage !== rowsPerPage) {
                setRowsPerPage(newRowsPerPage);
                setPage(0);
            }
        },
        [rowsPerPage]
    );

    return (
        <>
            <CssBaseline />
            <Container maxWidth={false}>
                {content.length === 0 ? (
                    <Typography variant='h6'>No Modules Found</Typography>
                ) : (
                    <TableContainer>
                        <Table sx={{ minWidth: 100 }} aria-label="Modules">
                            <TableBody>
                                {(rowsPerPage > 0
                                    ? content.slice(
                                          page * rowsPerPage,
                                          page * rowsPerPage + rowsPerPage
                                      )
                                    : content
                                ).map((content) => (
                                    <TableRow key={content.moduleName}>
                                        <TableCell component="th" scope="row">
                                            <Link
                                                target="_blank"
                                                underline="always"
                                                rel="noreferrer"
                                                href={`${content.modifiedSourceType}`}
                                            >
                                                {content.moduleName}
                                            </Link>
                                        </TableCell>
                                        <TableCell component="th" scope="row">
                                            {content?.sourceType === null
                                                ? 'Not Available'
                                                : SourceTypes[content.sourceType]}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {emptyRows > 0 && (
                                    <TableRow style={{ height: 53 * emptyRows }}>
                                        <TableCell colSpan={2} />
                                    </TableRow>
                                )}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TablePagination
                                        rowsPerPageOptions={[5, 10, { label: 'All', value: -1 }]}
                                        colSpan={3}
                                        count={content.length}
                                        rowsPerPage={rowsPerPage}
                                        page={page}
                                        SelectProps={{
                                            inputProps: {
                                                'aria-label': 'rows per page',
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

render(<Popup />, document.getElementById('sources-popup'));


// interface IProps {}

// export const Popup: FC<IProps> = () => {
    
//     const [content, setContent] = useState<DisplayHlcModule[]>([]);
//     const [rowsPerPage, setRowsPerPage] = React.useState(5);
//     const [page, setPage] = React.useState(0);

//     useEffect( () => {
//         const queryChromeTab = async ():Promise<chrome.tabs.Tab> => {
//             const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
//             return tab;
//         }

//         const sendMessage = async (currentTabId: number, message: any): Promise<DisplayHlcModule[]> => {
//           return await chrome.tabs.sendMessage(currentTabId,message);
//         }

//         const loadContentScript = async (tabId: number) => {
//            return await chrome.scripting.executeScript({
//                 target: {tabId: tabId, allFrames: true},
//                 files: ['contentscript.js'],
//             });
//         }
        
        
//         queryChromeTab().then((tab) => {
//             let tabId = tab?.id || 0 ;
//             if(tab.id != null || 0){
//                 console.log(tabId);
//                 console.log(tab.url);
//                 loadContentScript(tabId).then((loadResult) => {
//                     if(!loadResult){
//                         return;
//                     }
//                     console.log("Sending my message")
//                     sendMessage(tabId, {tabId: tab.id, tabUrl: tab?.url || ''}).then((result) => {
//                         console.log("I got a response");
//                         console.log(result)
//                         if(Array.isArray(result) && result.length !== 0){
//                             //console.log(JSON.stringify(result));
//                             setContent(result);
//                         }
//                     }).catch(err => {
//                         console.log(err);
//                     });
//                 });
//             }
//         });
    
//     });

//     //Avoid a layout jump when reaching the last page with empty rows.
//     const emptyRows =
//         page > 0 ? Math.max(0, (1 + page) * rowsPerPage - content.length) : 0;

//     const changePageHandler = (
//         event: React.MouseEvent<HTMLButtonElement> | null,
//         newPage: number,
//     ) => {
//         setPage(newPage);
//     };

//     const changeRowsPerPageHandler = (
//         event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
//     ) => {
//         setRowsPerPage(parseInt(event.target.value, 10));
//         setPage(0);
//     };

//         return (
//             <>
//                 <CssBaseline />
//                 <Container maxWidth={false}>
//                     {content.length === 0 ? (
//                             <Typography variant='h6'>No Modules Found</Typography>
//                     ) : (
//                         <>
//                             <TableContainer>
//                                 <Table sx={{ minWidth: 100}} aria-label="Modules">
//                                     <TableBody>
//                                         {(rowsPerPage > 0
//                                                 ? content.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
//                                                 : content
//                                         ).map((content) => (
//                                             <TableRow key={content.moduleName}>
//                                                 <TableCell component="th" scope="row">
//                                                     <Link target="_blank" underline="always" rel="noreferrer" href={`${content.modifiedSourceType}`}>
//                                                         {content.moduleName}
//                                                     </Link>
//                                                 </TableCell>
//                                                 <TableCell component="th" scope="row">
//                                                     {content?.sourceType === null ? "Not Available" : SourceTypes[content.sourceType] }
//                                                 </TableCell>
//                                             </TableRow>
//                                         ))}
//                                         {emptyRows > 0 && (
//                                             <TableRow style={{ height: 53 * emptyRows }}>
//                                                 <TableCell colSpan={2} />
//                                             </TableRow>
//                                         )}
//                                     </TableBody>
//                                     <TableFooter>
//                                         <TableRow>
//                                             <TablePagination
//                                                 rowsPerPageOptions={[5, 10, { label: 'All', value: -1 }]}
//                                                 colSpan={3}
//                                                 count={content.length}
//                                                 rowsPerPage={rowsPerPage}
//                                                 page={page}
//                                                 SelectProps={{
//                                                 inputProps: {
//                                                     'aria-label': 'rows per page',
//                                                 },
//                                                 native: true,
//                                             }}
//                                                 onPageChange={changePageHandler}
//                                                 onRowsPerPageChange={changeRowsPerPageHandler}
//                                                 ActionsComponent={TablePaginationActions}
//                                             />
//                                         </TableRow>
//                                     </TableFooter>
//                                 </Table>
//                             </TableContainer>
//                         </>
//                     )}
//                 </Container>
//             </>
//           );
//     };        
//render(<Popup />, document.getElementById("sources-popup"));

