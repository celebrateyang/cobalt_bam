import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface HistoryItem {
    id: string;
    url: string;
    title: string;
    timestamp: number;
    type: string;
}

const HISTORY_KEY = 'cobalt_history';
const MAX_ITEMS = 50;

const getInitialHistory = (): HistoryItem[] => {
    if (!browser) return [];
    try {
        const stored = localStorage.getItem(HISTORY_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Failed to load history', e);
        return [];
    }
};

export const historyStore = writable<HistoryItem[]>(getInitialHistory());

if (browser) {
    historyStore.subscribe((value) => {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(value));
        } catch (e) {
            console.error('Failed to save history', e);
        }
    });
}

const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

export const addToHistory = (item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
    const newItem: HistoryItem = {
        ...item,
        id: generateId(),
        timestamp: Date.now(),
    };

    historyStore.update((items) => {
        const newItems = [newItem, ...items];
        if (newItems.length > MAX_ITEMS) {
            return newItems.slice(0, MAX_ITEMS);
        }
        return newItems;
    });
};

export const getHistory = (): HistoryItem[] => {
    let items: HistoryItem[] = [];
    const unsubscribe = historyStore.subscribe(value => items = value);
    unsubscribe();
    return items;
};

export const clearHistory = () => {
    historyStore.set([]);
};

export const removeFromHistory = (id: string) => {
    historyStore.update((items) => items.filter((item) => item.id !== id));
};
