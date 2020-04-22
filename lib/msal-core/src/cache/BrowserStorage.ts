/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClientConfigurationError } from "../error/ClientConfigurationError";
import { AuthError } from "../error/AuthError";

interface ICustomStorage {
    setItem(key: string, value: string): void;
    getItem(key: string): string | null;
    removeItem(key: string): void;
    clear(): void;
    key(index: number): string | undefined;
    getAllKeys(): string[];
}

class CustomStorageNotImplementedError extends Error {
    constructor(methodName: string) {
        super(`Method not implemented: "${methodName}" on the custom storage`);
    }
}

export class CustomStorage implements ICustomStorage {
    setItem(key: string, value: string): void {
        throw new CustomStorageNotImplementedError("setItem");
    }

    getItem(key: string): string {
        throw new CustomStorageNotImplementedError("getItem");
    }

    removeItem(key: string): void {
        throw new CustomStorageNotImplementedError("removeItem");
    }

    clear(): void {
        throw new CustomStorageNotImplementedError("clear");
    }

    key(index: number): string {
        throw new CustomStorageNotImplementedError("key");
    }

    getAllKeys(): string[] {
        throw new CustomStorageNotImplementedError("getAllKeysgetAllKeys");
    }
}

export type CacheLocation = "localStorage" | "sessionStorage" | ICustomStorage; // eslint-disable-line

/**
 * @hidden
 */
export class BrowserStorage {// Singleton

    protected cacheLocation: CacheLocation;

    constructor(cacheLocation: CacheLocation) {
        if (!window) {
            throw AuthError.createNoWindowObjectError("Browser storage class could not find window object");
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
    setItem(key: string, value: string, enableCookieStorage?: boolean): void {
        this.getStorage().setItem(key, value);
        if (enableCookieStorage) {
            this.setItemCookie(key, value);
        }
    }

    /**
     * get one item by key from storage
     * @param key
     * @param enableCookieStorage
     */
    getItem(key: string, enableCookieStorage?: boolean): string {
        if (enableCookieStorage && this.getItemCookie(key)) {
            return this.getItemCookie(key);
        }
        return this.getStorage().getItem(key);
    }

    /**
     * remove value from storage
     * @param key
     */
    removeItem(key: string): void {
        return this.getStorage().removeItem(key);
    }

    /**
     * clear storage (remove all items from it)
     */
    clear(): void {
        return this.getStorage().clear();
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
        const expr = new Date(today.getTime() + cookieLifeDays * 24 * 60 * 60 * 1000);
        return expr.toUTCString();
    }
}
