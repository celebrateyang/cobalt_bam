<script lang="ts">
    export let status: number;
    export let error: Error & { message?: string };

    const isNotFound = status === 404;
    const title = isNotFound ? 'Lost in transit' : 'Something went wrong';
    const description = isNotFound
        ? "The page you're looking for doesn’t exist or has moved."
        : (error?.message || 'An unexpected error occurred.');
</script>

<svelte:head>
    <title>404 | freesavevideo</title>
</svelte:head>

<main class="page" aria-labelledby="title">
        <section class="card">
            <div class="badge">freesavevideo</div>
            <p class="status">woops!</p>
            <h1 id="title">{title}</h1>
            <p class="description">{description}</p>
            <div class="actions">
                <a class="cta primary" href="/">Go to homepage</a>
                <a class="cta secondary" href="/en/faq">Visit FAQ</a>
            </div>
        </section>
</main>

<style>
    :global(body) {
        margin: 0;
        min-height: 100vh;
        background:
            radial-gradient(circle at 18% 22%, rgba(130, 181, 45, 0.12), transparent 26%),
            radial-gradient(circle at 78% 12%, rgba(130, 181, 45, 0.08), transparent 24%),
            linear-gradient(135deg, #fdfefe, #f6f7f9 45%, #eef1f5);
        color: #1f2937;
        font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
        display: grid;
        place-items: center;
        padding: 2.5rem 1.5rem;
    }

    .page {
        width: min(520px, 100%);
    }

    .card {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        padding: 32px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.08);
        text-align: center;
    }

    .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(130, 181, 45, 0.12);
        color: #82b52d;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        font-size: 0.8rem;
    }

    .status {
        margin: 12px 0 0;
        color: #82b52d;
        letter-spacing: 0.08em;
        font-weight: 700;
    }

    h1 {
        margin: 10px 0 10px;
        font-size: 2.1rem;
        letter-spacing: -0.02em;
        color: #1f2937;
    }

    .description {
        margin: 0 0 24px;
        color: #6b7280;
        line-height: 1.55;
    }

    .actions {
        display: flex;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
    }

    .cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 18px;
        border-radius: 12px;
        font-weight: 700;
        text-decoration: none;
        transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
    }

    .primary {
        background: #82b52d;
        color: #0c1a05;
        box-shadow: 0 10px 28px rgba(130, 181, 45, 0.22);
    }

    .secondary {
        background: transparent;
        color: #1f2937;
        border: 1px solid #e5e7eb;
    }

    .primary:hover {
        transform: translateY(-2px);
        background: #6fa525;
        box-shadow: 0 12px 30px rgba(130, 181, 45, 0.26);
    }

    .secondary:hover {
        transform: translateY(-2px);
        border-color: #d1d5db;
        background: rgba(130, 181, 45, 0.06);
    }
</style>
