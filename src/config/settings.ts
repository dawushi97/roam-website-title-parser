import { HARDCODED_BLACKLIST, YOUTUBE_DOMAINS } from './constants';

// extensionAPI reference, set during onload
let extensionAPI: any = null;

export function initSettings(api: any): void {
    extensionAPI = api;

    extensionAPI.settings.panel.create({
        tabTitle: "Website Title Parser",
        settings: [
            {
                id: "plugin-enabled",
                name: "Enable Plugin",
                description: "Toggle the URL title parsing functionality on or off.",
                action: {
                    type: "switch",
                    onChange: (evt: { target: { checked: boolean } }) => {
                        console.log(`Website Title Parser: ${evt.target.checked ? 'enabled' : 'disabled'}`);
                    }
                }
            },
            {
                id: "youtube-blacklist",
                name: "Exclude YouTube URLs",
                description: "YouTube links can be embedded natively in Roam. Enable this to skip parsing YouTube URLs.",
                action: {
                    type: "switch",
                    onChange: (evt: { target: { checked: boolean } }) => {
                        console.log(`YouTube blacklist: ${evt.target.checked ? 'on' : 'off'}`);
                    }
                }
            },
            {
                id: "custom-blacklist",
                name: "Custom Blacklist Domains",
                description: "Comma-separated domains to exclude from parsing (e.g. example.com, foo.org). Bilibili is always excluded.",
                action: {
                    type: "input",
                    placeholder: "example.com, foo.org",
                    onChange: (evt: { target: { value: string } }) => {
                        console.log(`Custom blacklist updated: ${evt.target.value}`);
                    }
                }
            }
        ]
    });

    // Set default values if not already set
    if (extensionAPI.settings.get("plugin-enabled") === null ||
        extensionAPI.settings.get("plugin-enabled") === undefined) {
        extensionAPI.settings.set("plugin-enabled", true);
    }
}

export function isPluginEnabled(): boolean {
    if (!extensionAPI) return true;
    const value = extensionAPI.settings.get("plugin-enabled");
    // Default to enabled if not set
    if (value === null || value === undefined) return true;
    return Boolean(value);
}

export function setPluginEnabled(enabled: boolean): void {
    if (!extensionAPI) return;
    extensionAPI.settings.set("plugin-enabled", enabled);
}

export function getExcludedUrls(): string[] {
    const excluded: string[] = [...HARDCODED_BLACKLIST];

    if (!extensionAPI) return excluded;

    // YouTube toggle
    const youtubeBlacklisted = extensionAPI.settings.get("youtube-blacklist");
    if (youtubeBlacklisted) {
        excluded.push(...YOUTUBE_DOMAINS);
    }

    // Custom blacklist domains
    const customBlacklist = extensionAPI.settings.get("custom-blacklist");
    if (customBlacklist && typeof customBlacklist === 'string') {
        const domains = customBlacklist
            .split(',')
            .map((d: string) => d.trim())
            .filter((d: string) => d.length > 0);

        for (const domain of domains) {
            // Normalize: add both with and without www
            const normalized = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
            excluded.push(`https://${normalized}`);
            excluded.push(`http://${normalized}`);
            if (!normalized.startsWith('www.')) {
                excluded.push(`https://www.${normalized}`);
                excluded.push(`http://www.${normalized}`);
            }
        }
    }

    return excluded;
}

export function cleanupSettings(): void {
    extensionAPI = null;
}
