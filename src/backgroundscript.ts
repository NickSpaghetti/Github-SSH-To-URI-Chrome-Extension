try{
    chrome.tabs.onUpdated.addListener( function (tabId, changeInfo, tab) {
        console.log(changeInfo.status);
        if (changeInfo.status == 'complete' && tab.active && tab.url !== undefined && new URL(tab.url).hostname !== "github.com" && tab.id !== undefined) {
      
           chrome.scripting.executeScript({
               files: ['contentScript.js'],
               target: {tabId: tab.id},
           });
        }
      });
      
} catch(e){
    console.log(e);
}