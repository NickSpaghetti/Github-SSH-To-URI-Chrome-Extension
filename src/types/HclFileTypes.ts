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
