import React, {FC, useEffect, useState} from 'react';
import {render} from 'react-dom'
import LastPageIcon from '@mui/icons-material/LastPage';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import {
    Container,
    CssBaseline,
    Typography,
    Table,
    TableBody,
    TableContainer,
    TableFooter,
    TableRow, TablePagination, IconButton, Box, useTheme, TableCell, Link
} from '@mui/material';
import {DisplayHlcModule} from "../models/DisplayHclModule";
import {KeyboardArrowLeft, KeyboardArrowRight} from "@mui/icons-material";
import {SourceTypes} from "../types/SourceTypes";

interface IProps {}

export const Popup: FC<IProps> = () => {
    
    const [content, setContent] = useState<DisplayHlcModule[]>([])
    const [rowsPerPage, setRowsPerPage] = React.useState(5);
    const [page, setPage] = React.useState(0);

    useEffect( () => {
        const queryChromeTab = async ():Promise<chrome.tabs.Tab> => {
            const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
            return tab;
        }

        const sendMessage = async (currentTabId: number, message: any): Promise<DisplayHlcModule[]> => {
          return await chrome.tabs.sendMessage(currentTabId,message);
        }

        const loadContentScript = async (tabId: number) => {
           return await chrome.scripting.executeScript({
                target: {tabId: tabId, allFrames: true},
                files: ['contentscript.js'],
            });
        }
        
        
        queryChromeTab().then((tab) => {
            let tabId = tab?.id || 0 ;
            if(tab.id != null || 0){
                console.log(tabId);
                console.log(tab.url);
                loadContentScript(tabId).then((loadResult) => {
                    if(!loadResult){
                        return;
                    }
                    console.log("Sending my message")
                    sendMessage(tabId, {tabId: tab.id, tabUrl: tab?.url || ''}).then((result) => {
                        console.log("I got a response");
                        if(result.length !== 0){
                            console.log(JSON.stringify(result));
                            setContent(result);
                        }
                    }).catch(err => {
                        console.log(err);
                    });
                });
            }
        });
    
    });


    interface ITablePaginationActionsProps {
        count: number;
        page: number;
        rowsPerPage: number;
        onPageChange: (
            event: React.MouseEvent<HTMLButtonElement>,
            newPage: number,
        ) => void;
    }

    function TablePaginationActions(props: ITablePaginationActionsProps) {
        const theme = useTheme();
        const { count, page, rowsPerPage, onPageChange } = props;

        const firstPageButtonClickHandler = (
            event: React.MouseEvent<HTMLButtonElement>,
        ) => {
            onPageChange(event, 0);
        };

        const BackButtonClickHandler = (event: React.MouseEvent<HTMLButtonElement>) => {
            onPageChange(event, page - 1);
        };

        const nextButtonClickHandler = (event: React.MouseEvent<HTMLButtonElement>) => {
            onPageChange(event, page + 1);
        };

        const lastPageButtonClickHandler = (event: React.MouseEvent<HTMLButtonElement>) => {
            onPageChange(event, Math.max(0, Math.ceil(count / rowsPerPage) - 1));
        };

        return (
            <Box sx={{ flexShrink: 0, ml: 2.5 }}>
                <IconButton
                    onClick={firstPageButtonClickHandler}
                    disabled={page === 0}
                    aria-label="first page"
                >
                    {theme.direction === 'rtl' ? <LastPageIcon /> : <FirstPageIcon />}
                </IconButton>
                <IconButton
                    onClick={BackButtonClickHandler}
                    disabled={page === 0}
                    aria-label="previous page"
                >
                    {theme.direction === 'rtl' ? <KeyboardArrowRight /> : <KeyboardArrowLeft />}
                </IconButton>
                <IconButton
                    onClick={nextButtonClickHandler}
                    disabled={page >= Math.ceil(count / rowsPerPage) - 1}
                    aria-label="next page"
                >
                    {theme.direction === 'rtl' ? <KeyboardArrowLeft /> : <KeyboardArrowRight />}
                </IconButton>
                <IconButton
                    onClick={lastPageButtonClickHandler}
                    disabled={page >= Math.ceil(count / rowsPerPage) - 1}
                    aria-label="last page"
                >
                    {theme.direction === 'rtl' ? <FirstPageIcon /> : <LastPageIcon />}
                </IconButton>
            </Box>
        );
    }

    // Avoid a layout jump when reaching the last page with empty rows.
    const emptyRows =
        page > 0 ? Math.max(0, (1 + page) * rowsPerPage - content.length) : 0;

    const changePageHandler = (
        event: React.MouseEvent<HTMLButtonElement> | null,
        newPage: number,
    ) => {
        setPage(newPage);
    };

    const changeRowsPerPageHandler = (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

        return (
            <>
                <CssBaseline />
                <Container maxWidth={false}>
                    {content.length === 0 ? (
                            <Typography variant='h6'>No Modules Found</Typography>
                    ) : (
                        <>
                            <TableContainer>
                                <Table sx={{ minWidth: 100}} aria-label="Modules">
                                    <TableBody>
                                        {(rowsPerPage > 0
                                                ? content.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                                                : content
                                        ).map((content) => (
                                            <TableRow key={content.moduleName}>
                                                <TableCell component="th" scope="row">
                                                    <Link target="_blank" underline="always" rel="noreferrer" href={`${content.modifiedSourceType}`}>
                                                        {content.moduleName}
                                                    </Link>
                                                </TableCell>
                                                <TableCell component="th" scope="row">
                                                    {content?.sourceType === null ? "Not Available" : SourceTypes[content.sourceType] }
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
                        </>
                    )}
                </Container>
            </>
          );
    };
    
          
render(<Popup />, document.getElementById("sources-popup"));

/*
<Grid
>
</Grid><Grid
    container
    direction="row"
    justifyContent="flex-start"
    alignItems="flex-start"
    sx={{height: '100vh', border: '1px solid #9eff49'}}
>
    <Grid item container maxWidth='70vw'>
        <Grid
            item
            xs={6}
            sx={{
                border: '1px solid grey',
                height: 600,
                backgroundColor: '#d6fff9',
            }}
        >
            <Typography variant='h4'>Module Name</Typography>
        </Grid>
        <Grid
            item
            xs={6}
            sx={{
                border: '1px solid grey',
                height: 600,
                backgroundColor: '#e481ff',
            }}
        >
            <Typography variant='h4'>Module Type</Typography>
        </Grid>
    </Grid>
</Grid></>*/
