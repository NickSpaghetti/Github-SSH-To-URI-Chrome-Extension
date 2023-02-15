import React, {FC, useEffect, useState} from 'react';
import {render} from 'react-dom'
import { IDisplayHlcModule } from '../models/IDisplayHclModule';

interface IProps {}

export const Popup: FC<IProps> = () => {
    
    const [content, setContent] = useState<string>('No Modules Found')
    useEffect( () => {
        const queryChromeTab = async ():Promise<chrome.tabs.Tab> => {
            const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
            return tab;
        }

        const sendMessage = async (currentTabId: number, message: any): Promise<IDisplayHlcModule[]> => {
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
                        if(result.length === 0){
                            setContent("No Modules Found");
                        }
                        else {
                            console.log(JSON.stringify(result));
                            setContent(JSON.stringify(result));
                        }
                    }).catch(err => {
                        console.log(err);
                    });
                });
            }
        });
    
    });   

        return (
            <div>
              {content}
            </div>
          );
    };
    
          
render(<Popup />, document.getElementById("sources-popup"));