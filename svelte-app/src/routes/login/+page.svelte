<script>
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { authStore } from '$lib/stores/auth.svelte.js';
	import { BACKGROUNDS } from '$lib/constants/backgrounds.js';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import { Eye, EyeOff } from 'lucide-svelte';

	// Toggle email auth panel visibility
	let showEmailForm = $state(false);

	// Auth mode switcher inside collapsible panel: 'login' or 'signup'
	let activeTab = $state('login');

	// Form inputs
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);

	// Error & Loading States
	let errorMessage = $state('');
	let successMessage = $state('');
	let isSubmitting = $state(false);

	// Background index and load check
	let currentBgIndex = $state(0);
	let currentBg = $derived(BACKGROUNDS[currentBgIndex]);
	let isImageLoaded = $state(false);

	onMount(() => {
		// Pick a random background on mount
		currentBgIndex = Math.floor(Math.random() * BACKGROUNDS.length);
	});

	// Reactively check if user gets authenticated and redirect
	$effect(() => {
		if (authStore.isAuthenticated && !authStore.isLoading) {
			goto('/');
		}
	});

	// Sign In / Sign Up triggers
	/** @param {SubmitEvent} e */
	async function handleSubmit(e) {
		e.preventDefault();
		errorMessage = '';
		successMessage = '';

		if (!email || !password) {
			errorMessage = 'Please fill out all fields.';
			return;
		}

		if (activeTab === 'signup') {
			if (password !== confirmPassword) {
				errorMessage = 'Passwords do not match.';
				return;
			}
			if (password.length < 6) {
				errorMessage = 'Password must be at least 6 characters.';
				return;
			}
		}

		isSubmitting = true;

		try {
			const { supabase } = await import('$lib/supabase');

			if (activeTab === 'login') {
				const { error } = await supabase.auth.signInWithPassword({
					email,
					password
				});
				if (error) throw error;
			} else {
				const { error } = await supabase.auth.signUp({
					email,
					password,
					options: {
						emailRedirectTo: `${window.location.origin}/auth/callback`
					}
				});
				if (error) throw error;
				successMessage = 'Sign up successful! Please check your email to verify your account.';
			}
		} catch (err) {
			console.error('Auth error:', err);
			// @ts-ignore
			errorMessage = err.message || 'An error occurred during authentication.';
		} finally {
			isSubmitting = false;
		}
	}

	async function loginWithOAuth(/** @type {'google' | 'discord'} */ provider) {
		errorMessage = '';
		isSubmitting = true;
		try {
			const { supabase } = await import('$lib/supabase');
			const { error } = await supabase.auth.signInWithOAuth({
				provider,
				options: {
					redirectTo: `${window.location.origin}/auth/callback`
				}
			});
			if (error) throw error;
		} catch (err) {
			console.error(`${provider} OAuth login failed:`, err);
			// @ts-ignore
			errorMessage = err.message || `Could not start login with ${provider}.`;
			isSubmitting = false;
		}
	}
</script>

<div class="login-layout">
	<!-- Left Side: Framed Artwork Container -->
	<div class="art-pane">
		{#if currentBg}
			<div class="art-container">
				<img 
					src={currentBg.url} 
					alt={currentBg.title} 
					class="art-image" 
					class:loaded={isImageLoaded}
					onload={() => isImageLoaded = true}
					referrerpolicy="no-referrer"
				/>
				
				{#if isImageLoaded && currentBg.artist}
					<div class="art-info" transition:fade={{ duration: 400 }}>
						<p class="art-artist">Art by {currentBg.artist}</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Right Side: Minimalist Solid Form Pane -->
	<div class="form-pane">
		<div class="form-wrapper">
			<a href="/" class="back-link">
				<span>← Back to deckbuilder</span>
			</a>

			<div class="form-header">
				<h1 class="form-title">Budgie</h1>
				<p class="form-subtitle">Sign in to save your work</p>
			</div>

			<!-- Google / Discord OAuth buttons (Primary) -->
			<div class="social-login-grid">
				<button 
					type="button" 
					class="social-btn google" 
					onclick={() => loginWithOAuth('google')}
					disabled={isSubmitting}
				>
					<svg class="social-icon" viewBox="0 0 24 24" width="18" height="18">
						<path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.68 1.54 14.98 1 12 1 7.35 1 3.37 3.65 1.4 7.56l3.85 2.99c.9-2.7 3.4-4.51 6.75-4.51z"/>
						<path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.44h6.44c-.28 1.47-1.11 2.72-2.36 3.56l3.66 2.84c2.14-1.98 3.39-4.89 3.39-8.5z"/>
						<path fill="#FBBC05" d="M5.25 14.57c-.24-.72-.38-1.5-.38-2.31s.14-1.59.38-2.31L1.4 6.95C.51 8.75 0 10.79 0 13s.51 4.25 1.4 6.05l3.85-2.98c-.24-.72-.38-1.5-.38-2.31z"/>
						<path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.66-2.84c-1.01.68-2.32 1.09-4.3 1.09-3.35 0-5.85-1.81-6.75-4.51L1.4 16.81C3.37 20.35 7.35 23 12 23z"/>
					</svg>
					<span>Google</span>
				</button>
				
				<button 
					type="button" 
					class="social-btn discord" 
					onclick={() => loginWithOAuth('discord')}
					disabled={isSubmitting}
				>
					<svg class="social-icon" viewBox="0 0 127.14 96.36" width="18" height="18" fill="currentColor">
						<path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.88-.65,1.72-1.34,2.51-2a75.58,75.58,0,0,0,73,0c.79.71,1.63,1.4,2.51,2a68.43,68.43,0,0,1-10.5,5A77.7,77.7,0,0,0,111.41,96.36a105.73,105.73,0,0,0,31-18.83C145,54.65,139.14,31.58,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/>
					</svg>
					<span>Discord</span>
				</button>
			</div>

			<!-- Secondary Email Authorization Toggle Link -->
			<div class="email-toggle-container">
				<button 
					type="button" 
					class="email-toggle-btn"
					onclick={() => showEmailForm = !showEmailForm}
				>
					{showEmailForm ? 'Hide email option' : 'Or sign in with email'}
				</button>
			</div>

			{#if showEmailForm}
				<div class="email-auth-section" transition:slide={{ duration: 200 }}>
					<!-- Sliding login/signup switcher tab header -->
					<div class="tabs-header">
						<button 
							class="tab-btn" 
							class:active={activeTab === 'login'} 
							onclick={() => { activeTab = 'login'; errorMessage = ''; successMessage = ''; }}
						>
							Log In
						</button>
						<button 
							class="tab-btn" 
							class:active={activeTab === 'signup'} 
							onclick={() => { activeTab = 'signup'; errorMessage = ''; successMessage = ''; }}
						>
							Sign Up
						</button>
						<div class="tab-slider" class:slide-right={activeTab === 'signup'}></div>
					</div>

					{#if errorMessage}
						<div class="alert alert-error" transition:slide={{ duration: 150 }}>
							<p class="text-xs">{errorMessage}</p>
						</div>
					{/if}

					{#if successMessage}
						<div class="alert alert-success" transition:slide={{ duration: 150 }}>
							<p class="text-xs">{successMessage}</p>
						</div>
					{/if}

					<form onsubmit={handleSubmit} class="auth-form">
						<div class="input-field">
							<label for="email" class="input-label">Email address</label>
							<div class="input-wrapper">
								<Input 
									type="email" 
									id="email" 
									placeholder="email@example.com" 
									bind:value={email}
									required
									disabled={isSubmitting}
								/>
							</div>
						</div>

						<div class="input-field">
							<label for="password" class="input-label">Password</label>
							<div class="input-wrapper">
								<Input 
									type={showPassword ? "text" : "password"} 
									id="password" 
									placeholder="Enter your password" 
									bind:value={password}
									required
									disabled={isSubmitting}
								/>
								<button 
									type="button" 
									class="eye-btn" 
									onclick={() => showPassword = !showPassword}
									title={showPassword ? "Hide password" : "Show password"}
								>
									{#if showPassword}
										<EyeOff size={16} />
									{:else}
										<Eye size={16} />
									{/if}
								</button>
							</div>
						</div>

						{#if activeTab === 'signup'}
							<div class="input-field" transition:slide={{ duration: 150 }}>
								<label for="confirm-password" class="input-label">Confirm password</label>
								<div class="input-wrapper">
									<Input 
										type={showPassword ? "text" : "password"} 
										id="confirm-password" 
										placeholder="Confirm your password" 
										bind:value={confirmPassword}
										required
										disabled={isSubmitting}
									/>
								</div>
							</div>
						{/if}

						<Button type="submit" variant="default" class="submit-btn" disabled={isSubmitting}>
							{#if isSubmitting}
								<div class="spinner"></div>
								<span>Processing...</span>
							{:else}
								<span>{activeTab === 'login' ? 'Sign In' : 'Create Account'}</span>
							{/if}
						</Button>
					</form>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.login-layout {
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		background-color: #121214;
		padding: 0.75rem;
		box-sizing: border-box;
		gap: 0.75rem;
	}

	/* Left side Art Pane */
	.art-pane {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
	}

	.art-container {
		position: relative;
		width: 100%;
		height: 100%;
		border-radius: 12px;
		overflow: hidden;
		background-color: #0c0c0e;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.art-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center;
		opacity: 0;
		transition: opacity 0.8s ease-in-out;
	}

	.art-image.loaded {
		opacity: 1;
	}

	.art-info {
		position: absolute;
		bottom: 2rem;
		left: 2rem;
		z-index: 10;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
	}

	.art-artist {
		font-size: 0.6875rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.55);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	/* Right side Form Pane */
	.form-pane {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		background-color: #121214;
		padding: 2rem;
		overflow-y: auto;
		box-sizing: border-box;
	}

	.form-wrapper {
		max-width: 400px;
		width: 100%;
		display: flex;
		flex-direction: column;
	}

	.back-link {
		align-self: flex-start;
		display: flex;
		align-items: center;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.8125rem;
		font-weight: 600;
		margin-bottom: 2.5rem;
		transition: color 0.15s;
	}

	.back-link:hover {
		color: var(--text-primary);
	}

	.form-header {
		margin-bottom: 2.5rem;
	}

	.form-title {
		font-family: Charter, Georgia, serif;
		font-size: 2.75rem;
		font-weight: 400;
		color: #ffffff;
		letter-spacing: -0.02em;
		margin-bottom: 0.5rem;
	}

	.form-subtitle {
		font-family: Charter, Georgia, serif;
		font-style: italic;
		font-size: 1.05rem;
		color: #a1a1aa;
	}

	/* Toggle trigger for email form */
	.email-toggle-container {
		display: flex;
		justify-content: center;
		margin-top: 1.75rem;
		margin-bottom: 1rem;
	}

	.email-toggle-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: color 0.15s;
	}

	.email-toggle-btn:hover {
		color: var(--text-primary);
		text-decoration: underline;
	}

	.email-auth-section {
		display: flex;
		flex-direction: column;
		width: 100%;
	}

	/* Tab sliders */
	.tabs-header {
		position: relative;
		display: flex;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: var(--radius-md);
		padding: 4px;
		margin-bottom: 1.75rem;
		width: 100%;
		box-sizing: border-box;
	}

	.tab-btn {
		flex: 1;
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 0.8125rem;
		font-weight: 600;
		padding: 0.625rem 0;
		cursor: pointer;
		z-index: 2;
		transition: color 0.25s;
		text-align: center;
	}

	.tab-btn.active {
		color: #ffffff;
	}

	.tab-slider {
		position: absolute;
		top: 4px;
		left: 4px;
		width: calc(50% - 4px);
		height: calc(100% - 8px);
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-sm);
		z-index: 1;
		transition: transform 0.25s cubic-bezier(0.25, 1, 0.5, 1);
	}

	.tab-slider.slide-right {
		transform: translateX(100%);
	}

	/* Form Elements */
	.auth-form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.input-field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.input-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
	}

	.input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
	}

	:global(.input-wrapper .ui-input) {
		height: 2.75rem !important;
		background-color: rgba(255, 255, 255, 0.02) !important;
		border: 1px solid rgba(255, 255, 255, 0.08) !important;
		border-radius: var(--radius-md) !important;
		font-size: 0.875rem !important;
		padding: 0 1rem !important;
		transition: all 0.2s !important;
		color: #ffffff !important;
		width: 100%;
	}

	:global(.input-wrapper .ui-input:focus-visible) {
		border-color: hsl(var(--primary)) !important;
		background-color: rgba(0, 0, 0, 0.4) !important;
		box-shadow: 0 0 0 3px hsla(var(--primary-hsl), 0.15) !important;
	}

	.eye-btn {
		position: absolute;
		right: 1rem;
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2;
		transition: color 0.15s;
	}

	.eye-btn:hover {
		color: var(--text-primary);
	}

	:global(.auth-form .submit-btn) {
		width: 100%;
		height: 2.75rem !important;
		margin-top: 0.5rem;
		font-weight: 600 !important;
		background-color: hsl(var(--primary)) !important;
		color: #ffffff !important;
		border-radius: var(--radius-md) !important;
		transition: all 0.2s !important;
	}

	:global(.auth-form .submit-btn:hover) {
		background-color: hsl(var(--primary) / 0.9) !important;
		box-shadow: 0 0 16px hsla(var(--primary-hsl), 0.2);
	}

	/* Alerts */
	.alert {
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		margin-bottom: 1.25rem;
		display: flex;
		align-items: center;
		font-weight: 500;
	}

	.alert-error {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		color: #fca5a5;
	}

	.alert-success {
		background: rgba(16, 185, 129, 0.1);
		border: 1px solid rgba(16, 185, 129, 0.2);
		color: #a7f3d0;
	}


	/* Social buttons */
	.social-login-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		width: 100%;
	}

	.social-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		color: var(--text-secondary);
		height: 2.5rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.social-btn:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
		border-color: rgba(255, 255, 255, 0.1);
	}

	.social-btn:active {
		transform: translateY(1px);
	}

	.social-icon {
		flex-shrink: 0;
	}

	.discord {
		color: #5865F2;
	}
	.discord:hover {
		background: rgba(88, 101, 242, 0.1);
		border-color: rgba(88, 101, 242, 0.2);
		color: #7289da;
	}

	.google:hover {
		background: rgba(255, 255, 255, 0.06);
	}

	/* Responsive adaptation for narrow screens / tablets / mobile */
	@media (max-width: 860px) {
		.login-layout {
			grid-template-columns: 1fr;
			grid-template-rows: 320px 1fr;
			height: auto;
			min-height: 100vh;
			overflow-y: auto;
			padding: 0.5rem;
			gap: 0.5rem;
		}

		.art-pane {
			height: 320px;
		}

		.art-container {
			border-radius: 8px;
		}

		.art-info {
			bottom: 1.25rem;
			left: 1.25rem;
		}

		.art-artist {
			font-size: 0.625rem;
		}

		.form-pane {
			padding: 2.5rem 1.25rem;
			align-items: flex-start;
			height: auto;
			overflow-y: visible;
		}

		.form-wrapper {
			max-width: 100%;
		}

		.back-link {
			margin-bottom: 2rem;
		}

	}
</style>
