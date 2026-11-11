import { axios } from "../deps.ts";
import type { AuthRef } from "../tools/types.ts";
import { API_BASE_URL } from "./config.ts";

// All requests go to the public FlowMate API, authenticated with the caller's own token.
export const BASE_URL = API_BASE_URL;

function flagIfUnauthorized(error: unknown, authRef: AuthRef): void {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
        authRef.unauthorized = true;
    }
}

export async function apiGet<T>(authRef: AuthRef, path: string, params?: Record<string, unknown>): Promise<T> {
    try {
        const response = await axios.get<T>(BASE_URL + path, { params, headers: { Authorization: authRef.value } });
        return response.data;
    } catch (error) {
        flagIfUnauthorized(error, authRef);
        throw error;
    }
}

export async function apiPost<T>(authRef: AuthRef, path: string, body?: unknown): Promise<T> {
    try {
        const response = await axios.post<T>(BASE_URL + path, body, { headers: { Authorization: authRef.value } });
        return response.data;
    } catch (error) {
        flagIfUnauthorized(error, authRef);
        throw error;
    }
}

export async function apiPatch<T>(authRef: AuthRef, path: string, body: unknown): Promise<T> {
    try {
        const response = await axios.patch<T>(BASE_URL + path, body, { headers: { Authorization: authRef.value } });
        return response.data;
    } catch (error) {
        flagIfUnauthorized(error, authRef);
        throw error;
    }
}

export async function apiDelete<T>(authRef: AuthRef, path: string): Promise<T> {
    try {
        const response = await axios.delete<T>(BASE_URL + path, { headers: { Authorization: authRef.value } });
        return response.data;
    } catch (error) {
        flagIfUnauthorized(error, authRef);
        throw error;
    }
}

export function formatError(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;
        return `API Error ${status}: ${message}`;
    }
    if (error instanceof Error) return error.message;
    return String(error);
}
