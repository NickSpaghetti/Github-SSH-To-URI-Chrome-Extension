import {TERRAFORM_VERSION_CONSTRAINTS} from "../util/constants";

export class HclVersionService {
    /**
     * Returns a map of {@link TERRAFORM_VERSION_CONSTRAINTS} found with their starting and ending indexs
     *
     *
     * @param version - Terraform version constraint ie: '>=3.5.0<4.0.0`
     * @returns Map<TERRAFORM_VERSION_CONSTRAINTS,Hit[]>
     *
     */
    findTerraformConstraintIndexes = (version: string): Map<string,Hit[]> => {
        const searchResults = new Map<string,Hit[]>();
        //look for any of the version constraints of size 1 or 2 and matches the group after the main exp does not include in result
        const signRegex = /[><=~=!]{1,2}(?=\d)/g;
        version = version.replace(/[, ]+/g, '');
        const matches = Array.from(version.matchAll(signRegex));
        for (const match of matches) {
            const sign = match[0];
            if(match.index !== undefined){
                const startIndex = match.index;
                const endIndex = startIndex + sign.length - 1;
                if(searchResults.has(sign)){
                    searchResults.get(sign)?.push({start: startIndex, end: endIndex});
                } else {
                    searchResults.set(sign,[{start: startIndex, end: endIndex}])
                }
            }
        }
        return searchResults;
    }

    /**
     * Returns the Terraform formatted version
     *
     *
     * @param version - Terraform version constraint ie: '>=3.5.0<4.0.0`
     * @returns Terraform version number ie: >= 3.5.0, < 4.0.0
     *
     */
    formatTerraformVersion = (version: string): string => {
        if(!isNaN(parseFloat(version))){
            return version;
        }
        version = version.replace(/[, ]+/g, '');
        const searchResultMap = this.findTerraformConstraintIndexes(version);
        if(version === '' || searchResultMap.size === 0){
            return '';
        }

        const sortedSearchResults = new Map([...searchResultMap.entries()].filter(([_,vs])  => vs.sort((a,b) => a.end - b.end)));

        const keys = Array.from(sortedSearchResults.keys());
        let outputVersion = ''
        if(keys.length === 1){
            let signs = sortedSearchResults.get(keys[0]) ?? [];
            if(signs.length >= 2){
                let signCount = 1;
                signs.forEach(sign => {
                    outputVersion += `${signCount %2 === 0 ? ', ' : ''}${version.substring(sign.start,sign.end + 1)} ${this.extractVersion(version,sign.end)}${signCount %2 === 0 ? ', ' : ''}`;
                    signCount++;
                });
            }
            else if (signs.length === 1){
                outputVersion = version.replace(version.slice(signs[0].start,signs[0].end + 1), version.slice(signs[0].start,signs[0].end + 1) + ' ');
            }
        }
        else {
            let signCount = 1;
            for(let [_,hits] of sortedSearchResults.entries()){
                hits.forEach(sign => {
                    outputVersion += `${signCount %2 === 0 ? ', ' : ''}${version.substring(sign.start,sign.end + 1)} ${this.extractVersion(version,sign.end)}${signCount %2 === 0 ? ', ' : ''}`;
                    signCount++;
                });
            }
        }
        if(outputVersion.endsWith(', ')){
            outputVersion = outputVersion.substring(0,outputVersion.lastIndexOf(','));
        }
        return outputVersion;
    }

    /**
     * Returns the Terraform version that is used when looking up the documentation.
     *
     *
     * @param version - Terraform version constraint ie: '>=3.5.0'
     * @param endOfSignIndex - The index of the constraint you want to start extracting from. ie: '>=3.5.0' where > is 1
     * @returns Terraform version number ie: '3.5.0'
     *
     */
    extractVersion = (version:string,endOfSignIndex: number): string => {
        let i = endOfSignIndex + 2;
        let extractedVersion = version.substring(endOfSignIndex + 1,i);
        while(i < version.length){
            let testVersion = version.substring(i, i + 1);
            if(isNaN(extractedVersion + testVersion as unknown as number) && Object.values(TERRAFORM_VERSION_CONSTRAINTS).some(c => c.includes(testVersion))){
                break;
            }
            extractedVersion += testVersion;
            i++;
        }
        return extractedVersion;
    }

    /**
     * Returns the Terraform version that is used when looking up the documentation.
     *
     *
     * @param version - Terraform version constraint
     * @returns Terraform version used to look up the documentation`
     *
     */
    public getMinimalTerraformVersion = (version: string): string =>{
        if(version === ''){
            return version;
        }
        if(!version.includes(' ')){
            version = this.formatTerraformVersion(version);
        }
        const [leftConstraint, rightConstraint] = version.split(', ');
        if(!rightConstraint){
            if(!isNaN(parseFloat(version))){
                return version.trim();
            }
            const [sign, versionConstraint] = leftConstraint.split(' ');
            return !parseFloat(sign) ? versionConstraint?.trim() ?? '' : sign?.trim() ?? '';
        }
        const [leftSign, leftVersion] = leftConstraint.split(' ');
        const [rightSign, rightVersion] = rightConstraint.split(' ');
        if(leftSign !== TERRAFORM_VERSION_CONSTRAINTS.GREATER_THAN_OR_EQUAL && (rightSign === TERRAFORM_VERSION_CONSTRAINTS.LESS_THAN_OR_EQUAL || rightSign === TERRAFORM_VERSION_CONSTRAINTS.GREATER_THAN_OR_EQUAL)){
            return rightVersion.trim();
        }
        if(leftSign === TERRAFORM_VERSION_CONSTRAINTS.GREATER_THAN_OR_EQUAL){
            return leftVersion.trim();
        }
        if(rightSign === TERRAFORM_VERSION_CONSTRAINTS.LESS_THAN_OR_EQUAL){
            return rightVersion.trim();
        }
        return leftVersion.trim();
    }
}
