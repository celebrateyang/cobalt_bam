<script lang="ts">
    // Client-side fallback just in case, or for visual feedback while redirect happens
</script>

<svelte:head>
    <title>Redirecting...</title>
    <meta name="robots" content="noindex" />
</svelte:head>

<div class="loading">
    <div class="spinner"></div>
    <p>Loading...</p>
</div>

<style>
    .loading {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-family:
            system-ui,
            -apple-system,
            sans-serif;
    }

    .spinner {
        width: 50px;
        height: 50px;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-bottom: 20px;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    p {
        font-size: 18px;
        margin: 0;
    }
</style>
