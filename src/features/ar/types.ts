export interface ArAssets {
  ar_model_url: string | null;
  ar_usdz_url: string | null;
  ar_enabled: boolean;
}

export const hasArEnabled = (item: Partial<ArAssets> | null | undefined): boolean =>
  !!item?.ar_enabled && !!item?.ar_model_url;
