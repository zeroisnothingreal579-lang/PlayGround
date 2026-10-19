declare module "@devicefarmer/adbkit-apkreader" {
  export interface ApkManifestComponent {
    name?: string;
    label?: string;
    icon?: string;
    intentFilters?: {
      actions?: { name?: string }[];
      categories?: { name?: string }[];
      data?: Record<string, unknown>[];
    }[];
    metaData?: Record<string, unknown>[];
    [key: string]: unknown;
  }

  export interface ApkManifest {
    package?: string;
    versionCode?: number;
    versionName?: string;
    installLocation?: string;
    compileSdkVersion?: number;
    compileSdkVersionCodename?: string;
    platformBuildVersionCode?: number;
    platformBuildVersionName?: string;
    usesSdk?: {
      minSdkVersion?: number | string;
      targetSdkVersion?: number | string;
      maxSdkVersion?: number | string;
      [key: string]: unknown;
    } | null;
    usesPermissions?: { name?: string; maxSdkVersion?: number | string }[];
    permissions?: { name?: string }[];
    permissionTrees?: { name?: string }[];
    permissionGroups?: { name?: string }[];
    usesFeatures?: { name?: string; required?: boolean; glEsVersion?: string }[];
    supportsScreens?: Record<string, unknown> | null;
    compatibleScreens?: Record<string, unknown>[];
    supportsGlTextures?: Record<string, unknown>[];
    instrumentation?: Record<string, unknown> | null;
    usesConfiguration?: Record<string, unknown> | null;
    application: {
      label?: string;
      icon?: string;
      theme?: string;
      debuggable?: boolean;
      allowBackup?: boolean;
      activities?: ApkManifestComponent[];
      activityAliases?: ApkManifestComponent[];
      launcherActivities?: ApkManifestComponent[];
      leanbackLauncherActivities?: ApkManifestComponent[];
      services?: ApkManifestComponent[];
      receivers?: ApkManifestComponent[];
      providers?: ApkManifestComponent[];
      usesLibraries?: { name?: string }[];
      metaData?: Record<string, unknown>[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  export default class ApkReader {
    static MANIFEST: string;
    static open(file: string | Buffer): Promise<ApkReader>;
    readManifest(): Promise<ApkManifest>;
    readContent(path: string): Promise<Buffer>;
    readXml(path: string, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
  }
}

declare module "app-info-parser" {
  export interface ParsedApkInfo {
    packageName?: string;
    appName?: string;
    versionName?: string;
    versionCode?: number | string;
    icon?: string;
    application?: {
      label?: string[];
      icon?: string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  export default class AppInfoParser {
    constructor(file: string | Buffer);
    parse(): Promise<ParsedApkInfo>;
  }
}
