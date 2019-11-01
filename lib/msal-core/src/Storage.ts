// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Constants, CacheKeys } from "./utils/Constants";
import { AccessTokenCacheItem } from "./AccessTokenCacheItem";
import { CacheLocation } from "./Configuration";
import { ClientConfigurationError } from "./error/ClientConfigurationError";

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
        throw new CustomStorageNotImplementedError('setItem');
    }

    async getItem(key: string): Promise<string> {
        throw new CustomStorageNotImplementedError('getItem');
    }

    async removeItem(key: string): Promise<void> {
        throw new CustomStorageNotImplementedError('removeItem');
    }

    async clear(): Promise<void> {
        throw new CustomStorageNotImplementedError('clear');
    }

    async key(index: number): Promise<string> {
        throw new CustomStorageNotImplementedError('key');
    }

    async getAllKeys(): Promise<string[]> {
        throw new CustomStorageNotImplementedError('getAllKeysgetAllKeys');
    }
}

export type CacheLocation = "localStorage" | "sessionStorage" | ICustomStorage;

/**
 * @hidden
 */
export class Storage { // Singleton

  private static instance: Storage;
  private cacheLocation: CacheLocation;

  constructor(cacheLocation: CacheLocation) {
    if (Storage.instance) {
      return Storage.instance;
    }

    this.cacheLocation = cacheLocation;

    if (typeof this.cacheLocation === 'string') {
        const stringStorageSupported = ((typeof window[this.cacheLocation] !== "undefined") && (window[this.cacheLocation] != null));

        if (!stringStorageSupported) {
            throw ClientConfigurationError.createNoStorageSupportedError();
          }
    }

    Storage.instance = this;

    return Storage.instance;
  }

    getStorage(): ICustomStorage | typeof localStorage {
        if (this.cacheLocation === 'localStorage') {
            return localStorage;
        }

        if (this.cacheLocation === 'sessionStorage') {
            return sessionStorage;
        }

        if (this.cacheLocation instanceof CustomStorage) {
            return this.cacheLocation;
        }

        throw new Error('Unsupported storage type');
    }

    // add value to storage
    async setItem(key: string, value: string, enableCookieStorage?: boolean): Promise<void> {
        const storageLocation = this.getStorage();
        
        await storageLocation.setItem(key, value);

        if (enableCookieStorage) {
            this.setItemCookie(key, value);
        }
    }

    // get one item by key from storage
    async getItem(key: string, enableCookieStorage?: boolean): Promise<string> {
        if (enableCookieStorage && this.getItemCookie(key)) {
            return this.getItemCookie(key);
        }

        const storageLocation = this.getStorage();

        return await storageLocation.getItem(key);
    }

    // remove value from storage
    async removeItem(key: string): Promise<void> {
        const storageLocation = this.getStorage();
        
        await storageLocation.removeItem(key);
    }

    // clear storage (remove all items from it)
    async clear(): Promise<void> {
        const storageLocation = this.getStorage();
        
        await storageLocation.clear();
    }

    async getAllAccessTokens(clientId: string, homeAccountIdentifier: string): Promise<Array<AccessTokenCacheItem>> {
        const results: Array<AccessTokenCacheItem> = [];
        let accessTokenCacheItem: AccessTokenCacheItem;

        const storage = this.getStorage();

        const keys = (storage instanceof CustomStorage) 
            ? await storage.getAllKeys()
            : Object.keys(storage);

        if (storage) {
            let key: string;
            for (key of keys) {
                if (key.match(clientId) && key.match(homeAccountIdentifier)) {
                    const value = await this.getItem(key);
                    if (value) {
                        accessTokenCacheItem = new AccessTokenCacheItem(JSON.parse(key), JSON.parse(value));
                        results.push(accessTokenCacheItem);
                    }
                }
            }
        }

        return results;
    }

    async removeAcquireTokenEntries(state?: string): Promise<void> {
        const storage = this.getStorage();

        const keys = (storage instanceof CustomStorage) 
            ? await storage.getAllKeys()
            : Object.keys(storage);

        if (storage) {
            let key: string;
            for (key of keys) {
                if ((key.indexOf(CacheKeys.AUTHORITY) !== -1 || key.indexOf(CacheKeys.ACQUIRE_TOKEN_ACCOUNT) !== 1) && (!state || key.indexOf(state) !== -1)) {
                    const splitKey = key.split(Constants.resourceDelimiter);
                    let state;
                    if (splitKey.length > 1) {
                        state = splitKey[1];
                    }
                    if (state && !this.tokenRenewalInProgress(state)) {
                        this.removeItem(key);
                        this.removeItem(Constants.renewStatus + state);
                        this.removeItem(Constants.stateLogin);
                        this.removeItem(Constants.stateAcquireToken);
                        this.setItemCookie(key, "", -1);
                    }
                }
            }
        }

        this.clearCookie();
    }

    private async tokenRenewalInProgress(stateValue: string): Promise<boolean> {
        const storage = this.getStorage();

        const renewStatus = await storage.getItem(Constants.renewStatus + stateValue);
        return !(!renewStatus || renewStatus !== Constants.tokenRenewStatusInProgress);
    }

    async resetCacheItems(): Promise<void> {
        const storage = this.getStorage();

        const keys = (storage instanceof CustomStorage) 
            ? await storage.getAllKeys()
            : Object.keys(storage);

        if (storage) {
            let key: string;
            for (key of keys) {
                if (key.indexOf(Constants.msal) !== -1) {
                    await this.removeItem(key);
                }
            }
            this.removeAcquireTokenEntries();
        }
    }

    setItemCookie(cName: string, cValue: string, expires?: number): void {
        let cookieStr = cName + "=" + cValue + ";";
        if (expires) {
            const expireTime = this.getCookieExpirationTime(expires);
            cookieStr += "expires=" + expireTime + ";";
        }

        document.cookie = cookieStr;
    }

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

    getCookieExpirationTime(cookieLifeDays: number): string {
        const today = new Date();
        const expr = new Date(today.getTime() + cookieLifeDays * 24 * 60 * 60 * 1000);
        return expr.toUTCString();
    }

    clearCookie(): void {
        this.setItemCookie(Constants.nonceIdToken, "", -1);
        this.setItemCookie(Constants.stateLogin, "", -1);
        this.setItemCookie(Constants.loginRequest, "", -1);
        this.setItemCookie(Constants.stateAcquireToken, "", -1);
    }

    /**
     * Create acquireTokenAccountKey to cache account object
     * @param accountId
     * @param state
     */
    static generateAcquireTokenAccountKey(accountId: any, state: string): string {
        return CacheKeys.ACQUIRE_TOKEN_ACCOUNT + Constants.resourceDelimiter +
            `${accountId}` + Constants.resourceDelimiter  + `${state}`;
    }

    /**
     * Create authorityKey to cache authority
     * @param state
     */
    static generateAuthorityKey(state: string): string {
        return CacheKeys.AUTHORITY + Constants.resourceDelimiter + `${state}`;
    }
}
