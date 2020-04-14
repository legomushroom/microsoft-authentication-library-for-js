/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Constants,
    PersistentCacheKeys,
    TemporaryCacheKeys,
    ErrorCacheKeys
} from "../utils/Constants";
import { AccessTokenCacheItem } from "./AccessTokenCacheItem";
import { BrowserStorage, CustomStorage, CacheLocation } from "./BrowserStorage";
import { ClientAuthError } from "../error/ClientAuthError";

/**
 * @hidden
 */
export class AuthCache extends BrowserStorage {
    // Singleton

    private clientId: string;
    private rollbackEnabled: boolean;

    constructor(
        clientId: string,
        cacheLocation: CacheLocation,
        storeAuthStateInCookie: boolean
    ) {
        super(cacheLocation);
        this.clientId = clientId;
        // This is hardcoded to true for now. We may make this configurable in the future
        this.rollbackEnabled = true;
        this.migrateCacheEntries(storeAuthStateInCookie);
    }

    /**
     * Support roll back to old cache schema until the next major release: true by default now
     * @param storeAuthStateInCookie
     */
    private async migrateCacheEntries(storeAuthStateInCookie: boolean) {
        const idTokenKey = `${Constants.cachePrefix}.${PersistentCacheKeys.IDTOKEN}`;
        const clientInfoKey = `${Constants.cachePrefix}.${PersistentCacheKeys.CLIENT_INFO}`;
        const errorKey = `${Constants.cachePrefix}.${ErrorCacheKeys.ERROR}`;
        const errorDescKey = `${Constants.cachePrefix}.${ErrorCacheKeys.ERROR_DESC}`;

        const idTokenValue = await super.getItem(idTokenKey);
        const clientInfoValue = await super.getItem(clientInfoKey);
        const errorValue = await super.getItem(errorKey);
        const errorDescValue = await super.getItem(errorDescKey);

        const values = [
            idTokenValue,
            clientInfoValue,
            errorValue,
            errorDescValue
        ];
        const keysToMigrate = [
            PersistentCacheKeys.IDTOKEN,
            PersistentCacheKeys.CLIENT_INFO,
            ErrorCacheKeys.ERROR,
            ErrorCacheKeys.ERROR_DESC
        ];

        keysToMigrate.forEach((cacheKey, index) =>
            this.duplicateCacheEntry(
                cacheKey,
                values[index],
                storeAuthStateInCookie
            )
        );
    }

    /**
     * Utility function to help with roll back keys
     * @param newKey
     * @param value
     * @param storeAuthStateInCookie
     */
    private duplicateCacheEntry(
        newKey: string,
        value: string,
        storeAuthStateInCookie?: boolean
    ) {
        if (value) {
            this.setItem(newKey, value, storeAuthStateInCookie);
        }
    }

    /**
     * Prepend msal.<client-id> to each key; Skip for any JSON object as Key (defined schemas do not need the key appended: AccessToken Keys or the upcoming schema)
     * @param key
     * @param addInstanceId
     */
    private generateCacheKey(key: string, addInstanceId: boolean): string {
        try {
            // Defined schemas do not need the key appended
            JSON.parse(key);
            return key;
        } catch (e) {
            if (
                key.indexOf(`${Constants.cachePrefix}`) === 0 ||
                key.indexOf(Constants.adalIdToken) === 0
            ) {
                return key;
            }
            return addInstanceId
                ? `${Constants.cachePrefix}.${this.clientId}.${key}`
                : `${Constants.cachePrefix}.${key}`;
        }
    }

    /**
     * add value to storage
     * @param key
     * @param value
     * @param enableCookieStorage
     */
    async setItem(
        key: string,
        value: string,
        enableCookieStorage?: boolean,
        state?: string
    ): Promise<void> {
        await super.setItem(
            this.generateCacheKey(key, true),
            value,
            enableCookieStorage
        );
        if (this.rollbackEnabled) {
            await super.setItem(
                this.generateCacheKey(key, false),
                value,
                enableCookieStorage
            );
        }
    }

    /**
     * get one item by key from storage
     * @param key
     * @param enableCookieStorage
     */
    async getItem(key: string, enableCookieStorage?: boolean): Promise<string> {
        return super.getItem(
            this.generateCacheKey(key, true),
            enableCookieStorage
        );
    }

    /**
     * remove value from storage
     * @param key
     */
    async removeItem(key: string): Promise<void> {
        await super.removeItem(this.generateCacheKey(key, true));
        if (this.rollbackEnabled) {
            await super.removeItem(this.generateCacheKey(key, false));
        }
    }

    /**
     * Reset the cache items
     */
    async resetCacheItems(): Promise<void> {
        const storage = this.getStorage();

        const keys =
            storage instanceof CustomStorage
                ? await storage.getAllKeys()
                : Object.keys(storage);
        let key: string;
        for (key of keys) {
            // Check if key contains msal prefix; For now, we are clearing all cache items created by MSAL.js
            if (key.indexOf(Constants.cachePrefix) !== -1) {
                await super.removeItem(key);
                // TODO: Clear cache based on client id (clarify use cases where this is needed)
            }
        }
    }

    /**
     * Reset all temporary cache items
     */
    async resetTempCacheItems(state: string): Promise<void> {
        const storage = this.getStorage();

        const keys =
            storage instanceof CustomStorage
                ? await storage.getAllKeys()
                : Object.keys(storage);
        let key: string;
        // check state and remove associated cache
        for (key of keys) {
            if (
                (!state || key.indexOf(state) !== -1) &&
                !this.tokenRenewalInProgress(state)
            ) {
                await this.removeItem(key);
                this.setItemCookie(key, "", -1);
                this.clearMsalCookie(state);
            }
        }
        // delete the interaction status cache
        await this.removeItem(TemporaryCacheKeys.INTERACTION_STATUS);
        await this.removeItem(TemporaryCacheKeys.REDIRECT_REQUEST);
    }

    /**
     * Set cookies for IE
     * @param cName
     * @param cValue
     * @param expires
     */
    setItemCookie(cName: string, cValue: string, expires?: number): void {
        super.setItemCookie(
            this.generateCacheKey(cName, true),
            cValue,
            expires
        );
        if (this.rollbackEnabled) {
            super.setItemCookie(
                this.generateCacheKey(cName, false),
                cValue,
                expires
            );
        }
    }

    /**
     * get one item by key from cookies
     * @param cName
     */
    getItemCookie(cName: string): string {
        return super.getItemCookie(this.generateCacheKey(cName, true));
    }

    /**
     * Get all access tokens in the cache
     * @param clientId
     * @param homeAccountIdentifier
     */
    async getAllAccessTokens(
        clientId: string,
        homeAccountIdentifier: string
    ): Promise<Array<AccessTokenCacheItem>> {
        const results: Array<AccessTokenCacheItem> = [];
        let accessTokenCacheItem: AccessTokenCacheItem;
        const storage = this.getStorage();

        const keys =
            storage instanceof CustomStorage
                ? await storage.getAllKeys()
                : Object.keys(storage);
        if(storage) {
            let key: string;
            for (key of keys) {
                if (key.match(clientId) && key.match(homeAccountIdentifier)) {
                    const value = await this.getItem(key);
                    try {
                        const parseAtKey = JSON.parse(key);
                        const newAccessTokenCacheItem = new AccessTokenCacheItem(
                            parseAtKey,
                            JSON.parse(value)
                        );
                        results.push(newAccessTokenCacheItem);
                    } catch {
                    }
                }
            }
        }

        return results;
    }

    /**
     * Return if the token renewal is still in progress
     * @param stateValue
     */
    private async tokenRenewalInProgress(stateValue: string): Promise<boolean> {
        const renewStatus = await this.getItem(
            `${TemporaryCacheKeys.RENEW_STATUS}|${stateValue}`
        );
        return !!(renewStatus && renewStatus === Constants.inProgress);
    }

    /**
     * Clear all cookies
     */
    public clearMsalCookie(state?: string): void {
        this.clearItemCookie(`${TemporaryCacheKeys.NONCE_IDTOKEN}|${state}`);
        this.clearItemCookie(`${TemporaryCacheKeys.STATE_LOGIN}|${state}`);
        this.clearItemCookie(`${TemporaryCacheKeys.LOGIN_REQUEST}|${state}`);
        this.clearItemCookie(`${TemporaryCacheKeys.STATE_ACQ_TOKEN}|${state}`);
    }

    /**
     * Create acquireTokenAccountKey to cache account object
     * @param accountId
     * @param state
     */
    public static generateAcquireTokenAccountKey(
        accountId: any,
        state: string
    ): string {
        return `${TemporaryCacheKeys.ACQUIRE_TOKEN_ACCOUNT}${Constants.resourceDelimiter}${accountId}${Constants.resourceDelimiter}${state}`;
    }

    /**
     * Create authorityKey to cache authority
     * @param state
     */
    public static generateAuthorityKey(state: string): string {
        return `${TemporaryCacheKeys.AUTHORITY}${Constants.resourceDelimiter}${state}`;
    }
}
