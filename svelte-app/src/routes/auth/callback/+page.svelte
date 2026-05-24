<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';

	let statusMessage = $state('Completing authentication...');
	let isError = $state(false);

	onMount(async () => {
		try {
			// Supabase automatically parses hash tokens (access_token, refresh_token) 
			// from the URL on load if the client is active. We fetch the session to verify.
			const { data, error } = await supabase.auth.getSession();
			
			if (error) {
				console.error('Callback error:', error.message);
				statusMessage = `Authentication failed: ${error.message}`;
				isError = true;
				// Still redirect after a short delay so they aren't stuck
				setTimeout(() => goto('/login'), 3000);
				return;
			}

			if (data.session) {
				statusMessage = 'Authentication successful! Redirecting home...';
				goto('/');
			} else {
				// No session found yet, wait briefly and try one more time
				setTimeout(async () => {
					const { data: retryData } = await supabase.auth.getSession();
					if (retryData.session) {
						statusMessage = 'Authentication successful! Redirecting home...';
						goto('/');
					} else {
						statusMessage = 'No active session found. Redirecting to login...';
						goto('/login');
					}
				}, 1000);
			}
		} catch (err) {
			console.error('Unhandled callback error:', err);
			statusMessage = 'An unexpected error occurred. Redirecting to login...';
			isError = true;
			setTimeout(() => goto('/login'), 2000);
		}
	});
</script>

<div class="callback-layout" role="status" aria-live="polite">
	<div class="callback-card">
		{#if !isError}
			<div class="spinner-glow">
				<div class="spinner"></div>
			</div>
		{/if}
		<h1 class="h3 tracking-tight status-heading" class:error-text={isError}>{statusMessage}</h1>
		<p class="text-sm text-secondary description">Please do not close this window.</p>
	</div>
</div>

<style>
	.callback-layout {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: radial-gradient(circle at center, hsl(var(--background) / 0.8) 0%, hsl(var(--background)) 100%);
		padding: 1.5rem;
	}

	.callback-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2.5rem;
		background: var(--bg-panel);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
		backdrop-filter: var(--glass-blur);
		max-width: 400px;
		width: 100%;
		text-align: center;
		gap: 1.25rem;
		position: relative;
		overflow: hidden;
	}

	.callback-card::before {
		content: "";
		position: absolute;
		top: -50%;
		left: -50%;
		width: 200%;
		height: 200%;
		background: radial-gradient(circle, hsla(var(--primary-hsl), 0.05) 0%, transparent 60%);
		pointer-events: none;
	}

	.spinner-glow {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		margin-bottom: 0.5rem;
	}

	.spinner-glow::after {
		content: "";
		position: absolute;
		width: 32px;
		height: 32px;
		background: hsl(var(--primary));
		border-radius: 50%;
		filter: blur(12px);
		opacity: 0.3;
	}

	:global(.callback-card .spinner) {
		width: 32px;
		height: 32px;
		border-width: 3px;
	}

	.status-heading {
		color: var(--text-primary);
		font-weight: 600;
	}

	.error-text {
		color: var(--danger);
	}

	.description {
		color: var(--text-secondary);
	}
</style>
