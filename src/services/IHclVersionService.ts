export interface IHclVersionService {
    findTerraformConstraintIndexes(version: string): Map<string,Hit[]>;
    formatTerraformVersion(version: string): string;
    extractVersion(version:string,endOfSignIndex: number): string;
    getMinimalTerraformVersion(version: string): string;
    getTerraformProviderVersionAsync(providerSource:string, providerType: string, versionConstraint: string):Promise<string>
}