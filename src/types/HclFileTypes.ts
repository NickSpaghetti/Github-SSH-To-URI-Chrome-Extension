export enum HclFileTypes {
    tf = "tf",
    hcl = "hcl",
    tofu = "tofu",
    tfJson = "tf.json",
    tofuJson = "tofu.json",
}

/**
 * Longest suffix first. OpenTofu 1.8 added `.tofu`, and both languages have a
 * JSON variant whose second extension the old lastIndexOf(".") read as the
 * whole type.
 */
export const HCL_FILE_SUFFIXES: ReadonlyArray<readonly [string, HclFileTypes]> = [
    [".tofu.json", HclFileTypes.tofuJson],
    [".tf.json", HclFileTypes.tfJson],
    [".tofu", HclFileTypes.tofu],
    [".hcl", HclFileTypes.hcl],
    [".tf", HclFileTypes.tf],
];

/**
 * @param fileType a recognised file type
 * @returns whether it is a JSON variant, which the wasm parser cannot read
 */
export const isJsonFileType = (fileType: HclFileTypes): boolean =>
    fileType === HclFileTypes.tfJson || fileType === HclFileTypes.tofuJson;
