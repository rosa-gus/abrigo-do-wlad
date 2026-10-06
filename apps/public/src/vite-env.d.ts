/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly PUBLIC_DEV_TOOLS: boolean;
	readonly VITE_RECAPTCHA_PUBLIC_KEY: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
