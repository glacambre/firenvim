
type NvimParameters = Array<[string, string]>;

interface INvimApiInfo {
    0: number;
    1: {
        error_types: {[key: string]: { id: number }},
        functions: Array<{
            deprecated_since?: number,
            method: boolean,
            name: string,
            parameters: NvimParameters,
            return_type: string,
            since: number,
        }>,
        types: {
            [key: string]: { id: number, prefix: string },
        },
        ui_events: Array<{
            name: string,
            parameters: NvimParameters,
            since: number,
        }>,
        ui_options: string[],
        version: {
            api_compatible: number,
            api_level: number,
            api_prerelease: boolean,
            major: number,
            minor: number,
            patch: number,
        },
    };
}

type ResizeUpdate = [number, number, number];
type GotoUpdate = [number, number, number];
type LineUpdate = [number, number, number, Array<[string, number, number?]>];
type HighlightUpdateElement = {
      background?: number,
      blend?: number,
      bold?: boolean,
      foreground?: number,
      italic?: boolean,
      reverse?: boolean,
      special?: number,
      strikethrough?: boolean,
      undercurl?: boolean,
      underline?: boolean,
}
type HighlightUpdate = [number, HighlightUpdateElement];
type HighlightElement = {
      background?: string,
      bold?: boolean,
      foreground?: string,
      italic?: boolean,
      special?: number,
      strikethrough?: boolean,
      undercurl?: boolean,
      underline?: boolean,
}
type HighlightArray = Array<HighlightElement>;
