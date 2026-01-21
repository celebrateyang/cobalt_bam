<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";

    import { auth, resources, type ResourceCategory, type ResourceLink } from "$lib/api/social";

    type CategoryItem = {
        category: ResourceCategory;
        depth: number;
    };

    let categoryList: ResourceCategory[] = [];
    let linkList: ResourceLink[] = [];

    let loadingCategories = true;
    let loadingLinks = false;
    let error = "";

    let selectedCategoryId: number | null = null;

    let showCategoryForm = false;
    let editingCategory: ResourceCategory | null = null;

    let showLinkForm = false;
    let editingLink: ResourceLink | null = null;

    let categoryForm = {
        parent_id: "",
        slug: "",
        sort_order: 0,
        is_active: true,
        name_zh: "",
        name_en: "",
    };

    let linkForm = {
        title: "",
        url: "",
        description: "",
        sort_order: 0,
        is_active: true,
    };

    $: lang = $page.params.lang;

    const getCategoryLabel = (category: ResourceCategory) =>
        category.names?.zh || category.names?.en || category.slug || `#${category.id}`;

    const buildCategoryTree = (items: ResourceCategory[]) => {
        const map = new Map<number, ResourceCategory & { children: ResourceCategory[] }>();
        items.forEach((item) => map.set(item.id, { ...item, children: [] }));

        const roots: (ResourceCategory & { children: ResourceCategory[] })[] = [];

        map.forEach((item) => {
            if (item.parent_id && map.has(item.parent_id)) {
                map.get(item.parent_id)?.children.push(item);
            } else {
                roots.push(item);
            }
        });

        const sortTree = (node: ResourceCategory & { children: ResourceCategory[] }) => {
            node.children.sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0));
            node.children.forEach(sortTree);
        };

        roots.forEach(sortTree);
        return roots;
    };

    const flattenTree = (
        nodes: (ResourceCategory & { children?: ResourceCategory[] })[],
        depth = 0,
        list: CategoryItem[] = []
    ) => {
        nodes.forEach((node) => {
            list.push({ category: node, depth });
            if (node.children?.length) {
                flattenTree(node.children, depth + 1, list);
            }
        });
        return list;
    };

    $: categoryTree = buildCategoryTree(categoryList);
    $: categoryItems = flattenTree(categoryTree);
    $: selectedCategory = categoryList.find((item) => item.id === selectedCategoryId) || null;

    onMount(async () => {
        const verified = await auth.verify();
        if (verified.status !== "success") {
            goto(`/${lang}/console-manage-2025`);
            return;
        }

        await loadCategories();
    });

    async function loadCategories() {
        loadingCategories = true;
        error = "";
        try {
            const response = await resources.categories.list({ include_inactive: true });
            if (response.status !== "success" || !response.data) {
                throw new Error(response.error?.message || "加载失败");
            }
            categoryList = response.data.categories || [];
            if (!selectedCategoryId && categoryList.length) {
                selectedCategoryId = categoryList[0].id;
                await loadLinks();
            }
        } catch (e) {
            error = e instanceof Error ? e.message : "加载失败";
        } finally {
            loadingCategories = false;
        }
    }

    async function loadLinks() {
        if (!selectedCategoryId) {
            linkList = [];
            return;
        }
        loadingLinks = true;
        error = "";
        try {
            const response = await resources.links.list({
                category_id: selectedCategoryId,
                include_inactive: true,
            });
            if (response.status !== "success" || !response.data) {
                throw new Error(response.error?.message || "加载失败");
            }
            linkList = response.data.links || [];
        } catch (e) {
            error = e instanceof Error ? e.message : "加载失败";
        } finally {
            loadingLinks = false;
        }
    }

    function selectCategory(id: number) {
        selectedCategoryId = id;
        void loadLinks();
    }

    function openCreateCategory() {
        editingCategory = null;
        categoryForm = {
            parent_id: "",
            slug: "",
            sort_order: 0,
            is_active: true,
            name_zh: "",
            name_en: "",
        };
        showCategoryForm = true;
    }

    function openEditCategory(category: ResourceCategory) {
        editingCategory = category;
        categoryForm = {
            parent_id: category.parent_id ? String(category.parent_id) : "",
            slug: category.slug || "",
            sort_order: category.sort_order || 0,
            is_active: category.is_active !== false,
            name_zh: category.names?.zh || "",
            name_en: category.names?.en || "",
        };
        showCategoryForm = true;
    }

    async function saveCategory() {
        error = "";
        const payload = {
            parent_id: categoryForm.parent_id ? Number(categoryForm.parent_id) : null,
            slug: categoryForm.slug,
            sort_order: Number(categoryForm.sort_order) || 0,
            is_active: categoryForm.is_active,
            names: {
                zh: categoryForm.name_zh,
                en: categoryForm.name_en,
            },
        };

        try {
            if (editingCategory) {
                const res = await resources.categories.update(editingCategory.id, payload);
                if (res.status !== "success" || !res.data) {
                    throw new Error(res.error?.message || "保存失败");
                }
                selectedCategoryId = res.data.id;
            } else {
                const res = await resources.categories.create(payload);
                if (res.status !== "success" || !res.data) {
                    throw new Error(res.error?.message || "保存失败");
                }
                selectedCategoryId = res.data.id;
            }
            showCategoryForm = false;
            await loadCategories();
        } catch (e) {
            error = e instanceof Error ? e.message : "保存失败";
        }
    }

    async function removeCategory(category: ResourceCategory) {
        if (!confirm(`确认删除分类：${getCategoryLabel(category)}？`)) return;
        try {
            const res = await resources.categories.delete(category.id);
            if (res.status !== "success") {
                throw new Error(res.error?.message || "删除失败");
            }
            if (selectedCategoryId === category.id) {
                selectedCategoryId = null;
                linkList = [];
            }
            await loadCategories();
        } catch (e) {
            error = e instanceof Error ? e.message : "删除失败";
        }
    }

    function openCreateLink() {
        if (!selectedCategoryId) {
            error = "请先选择分类";
            return;
        }
        editingLink = null;
        linkForm = {
            title: "",
            url: "",
            description: "",
            sort_order: 0,
            is_active: true,
        };
        showLinkForm = true;
    }

    function openEditLink(link: ResourceLink) {
        editingLink = link;
        linkForm = {
            title: link.title || "",
            url: link.url || "",
            description: link.description || "",
            sort_order: link.sort_order || 0,
            is_active: link.is_active !== false,
        };
        showLinkForm = true;
    }

    async function saveLink() {
        if (!selectedCategoryId) return;
        error = "";
        const payload = {
            category_id: selectedCategoryId,
            title: linkForm.title.trim(),
            url: linkForm.url.trim(),
            description: linkForm.description.trim(),
            sort_order: Number(linkForm.sort_order) || 0,
            is_active: linkForm.is_active,
        };

        try {
            if (editingLink) {
                const res = await resources.links.update(editingLink.id, payload);
                if (res.status !== "success" || !res.data) {
                    throw new Error(res.error?.message || "保存失败");
                }
            } else {
                const res = await resources.links.create(payload);
                if (res.status !== "success" || !res.data) {
                    throw new Error(res.error?.message || "保存失败");
                }
            }
            showLinkForm = false;
            await loadLinks();
        } catch (e) {
            error = e instanceof Error ? e.message : "保存失败";
        }
    }

    async function removeLink(link: ResourceLink) {
        if (!confirm(`确认删除链接：${link.title}？`)) return;
        try {
            const res = await resources.links.delete(link.id);
            if (res.status !== "success") {
                throw new Error(res.error?.message || "删除失败");
            }
            await loadLinks();
        } catch (e) {
            error = e instanceof Error ? e.message : "删除失败";
        }
    }
</script>

<svelte:head>
    <title>资源管理 - 竹子下载</title>
</svelte:head>

<div class="resources-admin">
    <header class="page-header">
        <div>
            <h1>资源管理</h1>
            <p>管理发现资源的分类与下载链接</p>
        </div>
    </header>

    {#if error}
        <div class="error-banner">{error}</div>
    {/if}

    <div class="admin-grid">
        <section class="panel">
            <div class="panel-header">
                <h2>分类</h2>
                <button class="btn-primary" type="button" on:click={openCreateCategory}>
                    新增分类
                </button>
            </div>

            {#if loadingCategories}
                <div class="panel-placeholder">加载中...</div>
            {:else if categoryItems.length === 0}
                <div class="panel-placeholder">暂无分类</div>
            {:else}
                <div class="category-list">
                    {#each categoryItems as item (item.category.id)}
                        <div
                            class="category-row"
                            class:is-active={selectedCategoryId === item.category.id}
                            style={`--depth:${item.depth}`}
                        >
                            <button class="category-label" type="button" on:click={() => selectCategory(item.category.id)}>
                                {getCategoryLabel(item.category)}
                            </button>
                            <div class="category-actions">
                                <button class="btn-secondary" type="button" on:click={() => openEditCategory(item.category)}>
                                    编辑
                                </button>
                                <button class="btn-danger" type="button" on:click={() => removeCategory(item.category)}>
                                    删除
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}

            {#if showCategoryForm}
                <form class="form" on:submit|preventDefault={saveCategory}>
                    <h3>{editingCategory ? "编辑分类" : "新增分类"}</h3>
                    <label>
                        上级分类
                        <select bind:value={categoryForm.parent_id}>
                            <option value="">无</option>
                            {#each categoryItems as item}
                                <option value={item.category.id}>
                                    {"-".repeat(item.depth)}{getCategoryLabel(item.category)}
                                </option>
                            {/each}
                        </select>
                    </label>
                    <label>
                        标识 (slug)
                        <input bind:value={categoryForm.slug} placeholder="high-school-math" />
                    </label>
                    <label>
                        排序
                        <input type="number" bind:value={categoryForm.sort_order} />
                    </label>
                    <label class="checkbox">
                        <input type="checkbox" bind:checked={categoryForm.is_active} />
                        启用
                    </label>
                    <label>
                        名称 (中文)
                        <input bind:value={categoryForm.name_zh} required />
                    </label>
                    <label>
                        名称 (英文)
                        <input bind:value={categoryForm.name_en} />
                    </label>
                    <div class="form-actions">
                        <button class="btn-primary" type="submit">保存</button>
                        <button class="btn-secondary" type="button" on:click={() => (showCategoryForm = false)}>
                            取消
                        </button>
                    </div>
                </form>
            {/if}
        </section>

        <section class="panel">
            <div class="panel-header">
                <div>
                    <h2>链接</h2>
                    {#if selectedCategory}
                        <p class="panel-subtitle">当前分类：{getCategoryLabel(selectedCategory)}</p>
                    {/if}
                </div>
                <button
                    class="btn-primary"
                    type="button"
                    on:click={openCreateLink}
                    disabled={!selectedCategoryId}
                >
                    新增链接
                </button>
            </div>

            {#if loadingLinks}
                <div class="panel-placeholder">加载中...</div>
            {:else if !selectedCategoryId}
                <div class="panel-placeholder">请先选择分类</div>
            {:else if linkList.length === 0}
                <div class="panel-placeholder">暂无链接</div>
            {:else}
                <div class="link-list">
                    {#each linkList as link (link.id)}
                        <div class="link-row">
                            <div>
                                <div class="link-title">{link.title}</div>
                                <div class="link-url">{link.url}</div>
                                {#if link.description}
                                    <div class="link-desc">{link.description}</div>
                                {/if}
                            </div>
                            <div class="link-actions">
                                <button class="btn-secondary" type="button" on:click={() => openEditLink(link)}>
                                    编辑
                                </button>
                                <button class="btn-danger" type="button" on:click={() => removeLink(link)}>
                                    删除
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}

            {#if showLinkForm}
                <form class="form" on:submit|preventDefault={saveLink}>
                    <h3>{editingLink ? "编辑链接" : "新增链接"}</h3>
                    <label>
                        标题
                        <input bind:value={linkForm.title} required />
                    </label>
                    <label>
                        解析链接
                        <input bind:value={linkForm.url} required placeholder="https://" />
                    </label>
                    <label>
                        描述
                        <textarea rows="3" bind:value={linkForm.description}></textarea>
                    </label>
                    <label>
                        排序
                        <input type="number" bind:value={linkForm.sort_order} />
                    </label>
                    <label class="checkbox">
                        <input type="checkbox" bind:checked={linkForm.is_active} />
                        启用
                    </label>
                    <div class="form-actions">
                        <button class="btn-primary" type="submit">保存</button>
                        <button class="btn-secondary" type="button" on:click={() => (showLinkForm = false)}>
                            取消
                        </button>
                    </div>
                </form>
            {/if}
        </section>
    </div>
</div>

<style>
    .resources-admin {
        padding: calc(var(--padding) * 2) 0 calc(var(--padding) * 4);
    }

    .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: calc(var(--padding) * 2);
    }

    .page-header h1 {
        margin: 0 0 6px 0;
        font-size: 1.6rem;
        font-weight: 800;
        color: var(--button-text);
    }

    .page-header p {
        margin: 0;
        color: var(--gray);
    }

    .admin-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
        gap: calc(var(--padding) * 1.5);
    }

    .panel {
        background: var(--popup-bg);
        border-radius: calc(var(--border-radius) * 1.5);
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
        padding: calc(var(--padding) * 1.25);
    }

    .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: calc(var(--padding) * 1.25);
    }

    .panel-header h2 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
    }

    .panel-subtitle {
        margin: 4px 0 0 0;
        color: var(--gray);
        font-size: 0.85rem;
    }

    .panel-placeholder {
        text-align: center;
        color: var(--gray);
        padding: calc(var(--padding) * 2);
        background: rgba(0, 0, 0, 0.04);
        border-radius: var(--border-radius);
    }

    .category-list,
    .link-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .category-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        border-radius: var(--border-radius);
        background: rgba(0, 0, 0, 0.04);
        padding-left: calc(12px + (var(--depth) * 14px));
    }

    .category-row.is-active {
        background: rgba(0, 0, 0, 0.1);
    }

    .category-label {
        border: none;
        background: none;
        font-weight: 600;
        color: var(--button-text);
        text-align: left;
        cursor: pointer;
        flex: 1;
    }

    .category-actions,
    .link-actions {
        display: flex;
        gap: 6px;
    }

    .link-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 12px;
        border-radius: var(--border-radius);
        background: rgba(0, 0, 0, 0.04);
    }

    .link-title {
        font-weight: 700;
        color: var(--button-text);
        margin-bottom: 4px;
    }

    .link-url {
        font-size: 0.85rem;
        color: var(--gray);
        margin-bottom: 4px;
        word-break: break-all;
    }

    .link-desc {
        font-size: 0.85rem;
        color: var(--gray);
    }

    .form {
        margin-top: calc(var(--padding) * 1.5);
        padding-top: calc(var(--padding) * 1.5);
        border-top: 1px solid var(--popup-stroke);
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .form h3 {
        margin: 0 0 4px 0;
        font-size: 1rem;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 0.85rem;
        color: var(--gray);
    }

    input,
    textarea,
    select {
        border: none;
        border-radius: var(--border-radius);
        padding: 10px 12px;
        background: var(--button);
        color: var(--button-text);
        font-size: 0.9rem;
        box-shadow: var(--button-box-shadow);
    }

    .checkbox {
        flex-direction: row;
        align-items: center;
        gap: 8px;
        color: var(--button-text);
    }

    .form-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
    }

    .btn-primary,
    .btn-secondary,
    .btn-danger {
        border: none;
        border-radius: var(--border-radius);
        padding: 8px 12px;
        font-size: 0.85rem;
        font-weight: 700;
        cursor: pointer;
        box-shadow: var(--button-box-shadow);
    }

    .btn-primary {
        background: var(--blue);
        color: var(--white);
    }

    .btn-secondary {
        background: var(--button);
        color: var(--button-text);
    }

    .btn-danger {
        background: rgba(255, 0, 0, 0.12);
        color: var(--button-text);
    }

    .error-banner {
        margin-bottom: calc(var(--padding) * 1.5);
        padding: 10px 12px;
        border-radius: var(--border-radius);
        background: rgba(255, 0, 0, 0.12);
        color: var(--button-text);
        box-shadow: 0 0 0 1px rgba(255, 0, 0, 0.2) inset;
    }

    @media (max-width: 900px) {
        .admin-grid {
            grid-template-columns: 1fr;
        }

        .panel-header {
            flex-direction: column;
            align-items: flex-start;
        }

        .link-row,
        .category-row {
            flex-direction: column;
            align-items: flex-start;
        }

        .category-actions,
        .link-actions {
            width: 100%;
            justify-content: flex-end;
        }
    }
</style>
