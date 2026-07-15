export const sliceCollectionFromItemKey = (items, itemKey, fallbackItem) => {
    if (!Array.isArray(items) || !itemKey) return items;

    const currentIndex = items.findIndex((item) => item?.itemKey === itemKey);
    if (currentIndex >= 0) {
        return currentIndex > 0 ? items.slice(currentIndex) : items;
    }

    return fallbackItem
        ? [fallbackItem, ...items.filter((item) => item?.itemKey !== itemKey)]
        : items;
};
