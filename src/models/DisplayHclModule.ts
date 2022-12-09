import { IDisplayHlcModule } from "./IDisplayHclModule";

export class DisplayHlcModule implements IDisplayHlcModule{
    uri: URL =  new URL('')
    source: string = ''
    constructor(uri: string, source: string){
        this.uri = new URL(uri);
        this.source = source;
    }
}