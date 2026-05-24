<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";

    import { auth } from "$lib/api/social";
    import {
        curiousCatAdmin,
        type CuriousCatActionType,
        type CuriousCatActivity,
    } from "$lib/api/curious-cat";

    type FormState = {
        id: number | null;
        name: string;
        activity_type: string;
        title: string;
        body: string;
        button_text: string;
        action_type: CuriousCatActionType;
        target_url: string;
        image_url: string;
        copy_text: string;
        reward_points: string;
        priority: string;
        is_active: boolean;
    };

    const emptyForm = (): FormState => ({
        id: null,
        name: "",
        activity_type: "wechat_group",
        title: "",
        body: "",
        button_text: "",
        action_type: "modal",
        target_url: "",
        image_url: "",
        copy_text: "",
        reward_points: "",
        priority: "0",
        is_active: true,
    });

    let activities: CuriousCatActivity[] = [];
    let form = emptyForm();
    let loading = true;
    let saving = false;
    let error = "";
    let notice = "";

    $: lang = $page.params.lang;

    onMount(async () => {
        const verified = await auth.verify();
        if (verified.status !== "success") {
            goto(`/${lang}/console-manage-2025`);
            return;
        }

        await loadActivities();
    });

    async function loadActivities() {
        loading = true;
        error = "";

        const response = await curiousCatAdmin.listActivities();
        if (response.status !== "success" || !response.data) {
            error = response.error?.message || "加载失败";
            activities = [];
        } else {
            activities = response.data.activities || [];
        }

        loading = false;
    }

    function editActivity(activity: CuriousCatActivity) {
        form = {
            id: activity.id,
            name: activity.name || "",
            activity_type: activity.activity_type || "custom",
            title: activity.title || "",
            body: activity.body || "",
            button_text: activity.button_text || "",
            action_type: activity.action_type || "modal",
            target_url: activity.target_url || "",
            image_url: activity.image_url || "",
            copy_text: activity.copy_text || "",
            reward_points:
                activity.reward_points === null || activity.reward_points === undefined
                    ? ""
                    : String(activity.reward_points),
            priority: String(activity.priority ?? 0),
            is_active: activity.is_active === true,
        };
        notice = "";
    }

    function resetForm() {
        form = emptyForm();
        notice = "";
        error = "";
    }

    function buildPayload() {
        return {
            name: form.name.trim(),
            activity_type: form.activity_type.trim(),
            title: form.title.trim(),
            body: form.body.trim(),
            button_text: form.button_text.trim(),
            action_type: form.action_type,
            target_url: form.target_url.trim() || null,
            image_url: form.image_url.trim() || null,
            copy_text: form.copy_text.trim() || null,
            reward_points: form.reward_points.trim() || null,
            priority: Number.parseInt(form.priority || "0", 10) || 0,
            is_active: form.is_active,
        };
    }

    async function saveActivity() {
        saving = true;
        error = "";
        notice = "";

        const payload = buildPayload();
        const response = form.id
            ? await curiousCatAdmin.updateActivity(form.id, payload)
            : await curiousCatAdmin.createActivity(payload);

        if (response.status !== "success") {
            error = response.error?.message || "保存失败";
        } else {
            notice = "已保存";
            resetForm();
            await loadActivities();
        }

        saving = false;
    }

    async function removeActivity(activity: CuriousCatActivity) {
        if (!window.confirm(`删除活动：${activity.name}？`)) return;

        const response = await curiousCatAdmin.deleteActivity(activity.id);
        if (response.status !== "success") {
            error = response.error?.message || "删除失败";
            return;
        }

        await loadActivities();
    }
</script>

<div class="admin-container">
    <header class="admin-header">
        <div>
            <div class="subtext">Curious Cat</div>
            <h1>好奇猫活动</h1>
        </div>
        <button class="secondary" type="button" on:click={resetForm}>新建活动</button>
    </header>

    {#if error}
        <div class="message error">{error}</div>
    {/if}
    {#if notice}
        <div class="message success">{notice}</div>
    {/if}

    <section class="editor">
        <div class="field">
            <label>内部名称</label>
            <input bind:value={form.name} placeholder="微信群 2026-05" />
        </div>
        <div class="field">
            <label>活动类型</label>
            <select bind:value={form.activity_type}>
                <option value="wechat_group">微信群</option>
                <option value="moments">发朋友圈</option>
                <option value="referral">专属链接</option>
                <option value="blind_box">开盲盒</option>
                <option value="feature">功能推荐</option>
                <option value="custom">自定义</option>
            </select>
        </div>
        <div class="field">
            <label>标题</label>
            <input bind:value={form.title} placeholder="喵，今天可以领积分" />
        </div>
        <div class="field">
            <label>按钮文案</label>
            <input bind:value={form.button_text} placeholder="查看二维码" />
        </div>
        <div class="field field-wide">
            <label>展示文案</label>
            <textarea bind:value={form.body} rows="4"></textarea>
        </div>
        <div class="field">
            <label>动作</label>
            <select bind:value={form.action_type}>
                <option value="modal">打开二维码/详情弹窗</option>
                <option value="link">跳转页面</option>
                <option value="blind_box">跳转开盲盒</option>
            </select>
        </div>
        <div class="field">
            <label>跳转地址</label>
            <input bind:value={form.target_url} placeholder="/{lang}/account?section=referral" />
        </div>
        <div class="field">
            <label>二维码图片 URL</label>
            <input bind:value={form.image_url} placeholder="https://..." />
        </div>
        <div class="field">
            <label>奖励积分展示</label>
            <input bind:value={form.reward_points} inputmode="numeric" placeholder="20" />
        </div>
        <div class="field">
            <label>优先级</label>
            <input bind:value={form.priority} inputmode="numeric" />
        </div>
        <label class="toggle">
            <input type="checkbox" bind:checked={form.is_active} />
            启用
        </label>
        <div class="field field-wide">
            <label>可复制宣传文案</label>
            <textarea bind:value={form.copy_text} rows="4"></textarea>
        </div>
        <div class="form-actions">
            <button class="primary" type="button" disabled={saving} on:click={saveActivity}>
                {saving ? "保存中" : form.id ? "更新活动" : "创建活动"}
            </button>
        </div>
    </section>

    <section class="list">
        {#if loading}
            <div class="empty">加载中</div>
        {:else if activities.length === 0}
            <div class="empty">暂无活动，先创建微信群、朋友圈或专属链接活动。</div>
        {:else}
            {#each activities as activity (activity.id)}
                <article class="activity">
                    <div class="activity-main">
                        <div class="activity-title">
                            {activity.title}
                            {#if !activity.is_active}
                                <span>停用</span>
                            {/if}
                        </div>
                        <div class="activity-body">{activity.body}</div>
                        <div class="activity-meta">
                            <span>{activity.name}</span>
                            <span>{activity.activity_type}</span>
                            <span>{activity.action_type}</span>
                            <span>优先级 {activity.priority}</span>
                            {#if activity.reward_points !== null}
                                <span>{activity.reward_points} 积分</span>
                            {/if}
                        </div>
                    </div>
                    <div class="activity-actions">
                        <button class="secondary" type="button" on:click={() => editActivity(activity)}>
                            编辑
                        </button>
                        <button class="danger" type="button" on:click={() => removeActivity(activity)}>
                            删除
                        </button>
                    </div>
                </article>
            {/each}
        {/if}
    </section>
</div>

<style>
    .admin-container {
        width: 100%;
        max-width: 1180px;
        padding: 30px 30px 60px 0;
    }

    .admin-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
    }

    .admin-header h1 {
        margin: 0;
        color: var(--secondary);
        font-size: 1.8rem;
    }

    .editor,
    .activity {
        background: var(--popup-bg);
        border-radius: 8px;
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
    }

    .editor {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        padding: 18px;
        margin-bottom: 20px;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .field-wide {
        grid-column: 1 / -1;
    }

    label {
        color: var(--gray);
        font-size: 0.82rem;
        font-weight: 700;
    }

    input,
    select,
    textarea {
        width: 100%;
        border: 1.5px solid var(--popup-stroke);
        border-radius: 8px;
        padding: 10px;
        color: var(--button-text);
        background: var(--button);
    }

    textarea {
        resize: vertical;
        min-height: 92px;
    }

    .toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--button-text);
    }

    .toggle input {
        width: auto;
    }

    .form-actions {
        display: flex;
        align-items: end;
        justify-content: end;
    }

    button {
        border: none;
        border-radius: 8px;
        padding: 9px 13px;
        min-height: 38px;
        color: var(--button-text);
        background: var(--button);
        font-weight: 800;
        cursor: pointer;
    }

    .primary {
        color: var(--white);
        background: var(--accent);
    }

    .danger {
        color: var(--white);
        background: var(--red);
    }

    .secondary:hover {
        background: var(--button-hover);
    }

    button:disabled {
        opacity: 0.6;
        cursor: progress;
    }

    .message {
        padding: 12px 14px;
        border-radius: 8px;
        margin-bottom: 14px;
        font-weight: 700;
    }

    .message.error {
        color: var(--button-text);
        background: rgba(255, 0, 0, 0.12);
    }

    .message.success {
        color: var(--button-text);
        background: color-mix(in srgb, var(--accent) 18%, transparent);
    }

    .list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .activity {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 14px;
        padding: 14px;
    }

    .activity-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--button-text);
        font-weight: 900;
        margin-bottom: 6px;
    }

    .activity-title span {
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 0.72rem;
        color: var(--white);
        background: var(--red);
    }

    .activity-body {
        color: var(--gray);
        line-height: 1.55;
        white-space: pre-wrap;
        margin-bottom: 8px;
    }

    .activity-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        color: var(--gray);
        font-size: 0.78rem;
    }

    .activity-actions {
        display: flex;
        align-items: start;
        gap: 8px;
    }

    .empty {
        padding: 24px;
        text-align: center;
        color: var(--gray);
        background: var(--popup-bg);
        border-radius: 8px;
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
    }

    @media (max-width: 820px) {
        .admin-container {
            padding: 16px;
        }

        .editor,
        .activity {
            grid-template-columns: 1fr;
        }

        .activity-actions {
            justify-content: end;
        }
    }
</style>
