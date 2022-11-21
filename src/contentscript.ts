enum FileType {
    tf = 'tf',
    hlc = 'hlc'
}

const getFileType = () => {
    const finalPath = document.querySelector('.final-path') as HTMLElement
    const innerText = finalPath?.innerText ?? '';
    const fileType = innerText.split('.');
    if(fileType.length !== 2){
        return ''
    }

    return fileType[1];

}

const findModules = () => {
    //regex string module (\"[\w]+\" \{)\n  source [\s]+\= (\"[\w\d\s].+\")
}

const getSourceUri = () => {
    const uri = ""
    return uri;
}

chrome.runtime.onMessage.addListener((message, sender, callback) => {

    let fileType = getFileType();
    if(!(fileType in FileType)){
        return;
    }
    let sourceUri = getSourceUri();
    callback(`uri: ${getSourceUri()}`);
});
