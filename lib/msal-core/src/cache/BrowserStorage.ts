/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClientConfigurationError } from "../error/ClientConfigurationError";
import { AuthError } from "../error/AuthError";

interface ICustomStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
    clear(): Promise<void>;
    key(index: number): Promise<string | undefined>;
    getAllKeys(): Promise<string[]>;
}

class CustomStorageNotImplementedError extends Error {
    constructor(methodName: string) {
        super(`Method not implemented: "${methodName}" on the custom storage`);
    }
}

export class CustomStorage implements ICustomStorage {
    async setItem(key: string, value: string): Promise<void> {
        throw new CustomStorageNotImplementedError("setItem");
    }

    async getItem(key: string): Promise<string> {
        throw new CustomStorageNotImplementedError("getItem");
    }

    async removeItem(key: string): Promise<void> {
        throw new CustomStorageNotImplementedError("removeItem");
    }

    async clear(): Promise<void> {
        throw new CustomStorageNotImplementedError("clear");
    }

    async key(index: number): Promise<string> {
        throw new CustomStorageNotImplementedError("key");
    }

    async getAllKeys(): Promise<string[]> {
        throw new CustomStorageNotImplementedError("getAllKeysgetAllKeys");
    }
}

export type CacheLocation = "localStorage" | "sessionStorage" | ICustomStorage; // eslint-disable-line

/**
 * @hidden
 */
export class BrowserStorage {
    // Singleton

    protected cacheLocation: CacheLocation;

    constructor(cacheLocation: CacheLocation) {
        if (!window) {
            throw AuthError.createNoWindowObjectError(
                "Browser storage class could not find window object"
            );
        }

        if (typeof this.cacheLocation === "string") {
            const stringStorageSupported =
                typeof window[this.cacheLocation] !== "undefined" &&
                window[this.cacheLocation] != null;

            if (!stringStorageSupported) {
                throw ClientConfigurationError.createStorageNotSupportedError(
                    this.cacheLocation
                );
            }
        }
        this.cacheLocation = cacheLocation;
    }

    getStorage(): ICustomStorage | typeof localStorage {
        if (this.cacheLocation === "localStorage") {
            return localStorage;
        }

        if (this.cacheLocation === "sessionStorage") {
            return sessionStorage;
        }

        if (this.cacheLocation instanceof CustomStorage) {
            return this.cacheLocation;
        }

        throw new Error("Unsupported storage type");
    }

    /**
     * add value to storage
     * @param key
     * @param value
     * @param enableCookieStorage
     */
    async setItem(key: string, value: string, enableCookieStorage?: boolean): Promise<void> {
        const storageLocation = this.getStorage();
        await storageLocation.setItem(key, value);
        if (enableCookieStorage) {
            this.setItemCookie(key, value);
        }
    }

    /**
     * get one item by key from storage
     * @param key
     * @param enableCookieStorage
     */
    async getItem(key: string, enableCookieStorage?: boolean): Promise<string> {
        if (enableCookieStorage && this.getItemCookie(key)) {
            return this.getItemCookie(key);
        }
        const storageLocation = this.getStorage();

        return await storageLocation.getItem(key);
    }

    /**
     * remove value from storage
     * @param key
     */
    async removeItem(key: string): Promise<void> {
        const storageLocation = this.getStorage();

        await storageLocation.removeItem(key);
    }

    /**
     * clear storage (remove all items from it)
     */
    async clear(): Promise<void> {
        const storageLocation = this.getStorage();

        await storageLocation.clear();
    }

    /**
     * add value to cookies
     * @param cName
     * @param cValue
     * @param expires
     */
    setItemCookie(cName: string, cValue: string, expires?: number): void {
        let cookieStr = cName + "=" + cValue + ";path=/;";
        if (expires) {
            const expireTime = this.getCookieExpirationTime(expires);
            cookieStr += "expires=" + expireTime + ";";
        }

        document.cookie = cookieStr;
    }

    /**
     * get one item by key from cookies
     * @param cName
     */
    getItemCookie(cName: string): string {
        const name = cName + "=";
        const ca = document.cookie.split(";");
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === " ") {
                c = c.substring(1);
            }
            if (c.indexOf(name) === 0) {
                return c.substring(name.length, c.length);
            }
        }
        return "";
    }

    /**
     * Clear an item in the cookies by key
     * @param cName
     */
    clearItemCookie(cName: string) {
        this.setItemCookie(cName, "", -1);
    }

    /**
     * Get cookie expiration time
     * @param cookieLifeDays
     */
    getCookieExpirationTime(cookieLifeDays: number): string {
        const today = new Date();
        const expr = new Date(
            today.getTime() + cookieLifeDays * 24 * 60 * 60 * 1000
        );
        return expr.toUTCString();
    }
}
