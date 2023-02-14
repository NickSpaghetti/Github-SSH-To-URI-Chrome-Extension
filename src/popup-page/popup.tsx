import React, {FC, useEffect, useState} from 'react';
import {render} from 'react-dom'
import { DisplayHlcModule } from '../models/DisplayHclModule';
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
          let response =  await chrome.tabs.sendMessage(currentTabId,message);
          return response;
        }

        const loadContentScript = async (tabId: number) => {
           let result = await chrome.scripting.executeScript({
                target: {tabId: tabId, allFrames: true},
                files: ['contentscript.js'],
            });
            return result;
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
                        setContent(JSON.stringify(result));
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