<script>
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { authStore } from '$lib/stores/auth.svelte.js';
	import { BACKGROUNDS } from '$lib/constants/backgrounds.js';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import { Mail, Lock, Eye, EyeOff, Shuffle, HelpCircle } from 'lucide-svelte';

	// Auth page tab state: 'login' or 'signup'
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

	// Background collection states
	let currentBgIndex = $state(0);
	let currentBg = $derived(BACKGROUNDS[currentBgIndex]);
	let aspectRatio = $state(1.5); // Defaults to standard landscape
	let isLandscape = $derived(aspectRatio > 1.25);
	let isImageLoaded = $state(false);

	// 3D Tilt Card interactive state
	/** @type {HTMLElement | null} */
	let cardElement = $state(null);
	let rotateX = $state(0);
	let rotateY = $state(0);
	let sheenX = $state(50);
	let sheenY = $state(50);
	let isHoveringCard = $state(false);

	onMount(() => {
		// Pick a random background to start
		currentBgIndex = Math.floor(Math.random() * BACKGROUNDS.length);
	});

	// Reactively check if user gets authenticated and redirect
	$effect(() => {
		if (authStore.isAuthenticated && !authStore.isLoading) {
			goto('/');
		}
	});

	// Trigger aspect ratio scanning whenever image changes
	$effect(() => {
		if (currentBg) {
			isImageLoaded = false;
			const img = new Image();
			img.src = currentBg.url;
			img.onload = () => {
				aspectRatio = img.naturalWidth / img.naturalHeight;
				isImageLoaded = true;
			};
		}
	});

	function shuffleBg() {
		let nextIndex;
		do {
			nextIndex = Math.floor(Math.random() * BACKGROUNDS.length);
		} while (nextIndex === currentBgIndex && BACKGROUNDS.length > 1);
		currentBgIndex = nextIndex;
	}

	// 3D Card Hover triggers
	/** @param {MouseEvent} e */
	function handleMouseMove(e) {
		if (!cardElement) return;
		const rect = cardElement.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		// Center coordinates mapping from -1 to 1
		const px = (x / rect.width) * 2 - 1;
		const py = (y / rect.height) * 2 - 1;

		// Tilt amount up to 10 degrees
		rotateX = -py * 10;
		rotateY = px * 10;

		sheenX = (x / rect.width) * 100;
		sheenY = (y / rect.height) * 100;
	}

	function handleMouseEnter() {
		isHoveringCard = true;
	}

	function handleMouseLeave() {
		isHoveringCard = false;
		rotateX = 0;
		rotateY = 0;
	}

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
	<!-- Full screen blurred backdrop glow -->
	<div 
		class="blurred-bg" 
		style="background-image: url('{currentBg?.url}');"
		role="presentation"
	></div>

	<!-- Action Controls -->
	<div class="header-actions">
		<button class="action-btn" onclick={shuffleBg} title="Shuffle Background Art">
			<Shuffle size={16} />
			<span>Shuffle Art</span>
		</button>
		<a href="/" class="action-btn" title="Back to Deckbuilder">
			<span>Back to builder</span>
		</a>
	</div>

	<!-- Main responsive adapter layout container -->
	<div 
		class="adapter-container" 
		class:layout-landscape={isLandscape} 
		class:layout-portrait={!isLandscape}
	>
		<!-- Left: The Glassmorphic Auth Form Card -->
		<div class="form-section">
			<div class="form-glass-card">
				<div class="logo">
					<span class="logo-text">Budgie</span>
					<span class="logo-sep">/</span>
					<span class="logo-sub">Deckbuilder</span>
				</div>

				<div class="tabs-header">
					<button 
						class="tab-btn" 
						class:active={activeTab === 'login'} 
						onclick={() => { activeTab = 'login'; errorMessage = ''; }}
					>
						Log In
					</button>
					<button 
						class="tab-btn" 
						class:active={activeTab === 'signup'} 
						onclick={() => { activeTab = 'signup'; errorMessage = ''; }}
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
						<label for="email" class="input-label">Email Address</label>
						<div class="input-wrapper">
							<Mail size={16} class="input-icon" />
							<Input 
								type="email" 
								id="email" 
								placeholder="you@example.com" 
								bind:value={email}
								required
								disabled={isSubmitting}
							/>
						</div>
					</div>

					<div class="input-field">
						<label for="password" class="input-label">Password</label>
						<div class="input-wrapper">
							<Lock size={16} class="input-icon" />
							<Input 
								type={showPassword ? "text" : "password"} 
								id="password" 
								placeholder="••••••••" 
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
							<label for="confirm-password" class="input-label">Confirm Password</label>
							<div class="input-wrapper">
								<Lock size={16} class="input-icon" />
								<Input 
									type={showPassword ? "text" : "password"} 
									id="confirm-password" 
									placeholder="••••••••" 
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

				<div class="divider">
					<span class="divider-text">Or continue with</span>
				</div>

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
			</div>
		</div>

		<!-- Right: Adaptive 3D Card Showcase of MTG Art -->
		<div class="art-section">
			<div class="art-container-scaler">
				{#key currentBgIndex}
					<div 
						class="art-card-glow" 
						style="background-image: url('{currentBg?.url}'); filter: blur(35px) saturate(2); aspect-ratio: {aspectRatio};"
						role="presentation"
					></div>

					<div 
						bind:this={cardElement}
						class="art-card" 
						class:hovering={isHoveringCard}
						onmousemove={handleMouseMove}
						onmouseenter={handleMouseEnter}
						onmouseleave={handleMouseLeave}
						style="transform: rotateX({rotateX}deg) rotateY({rotateY}deg); --sheen-x: {sheenX}%; --sheen-y: {sheenY}%; aspect-ratio: {aspectRatio};"
						role="img"
						aria-label="MTG Background Art Card"
					>
						<div class="card-sheen"></div>
						<div class="card-glow-borders"></div>
						<img 
							src={currentBg?.url} 
							alt={currentBg?.title} 
							class="card-img" 
							class:loaded={isImageLoaded}
						/>
					</div>
				{/key}
				
				<!-- Details Placard -->
				{#if currentBg}
					<div class="art-placard" transition:fade={{ duration: 200 }}>
						<h2 class="text-sm font-semibold card-title">{currentBg.title}</h2>
						<p class="text-xs set-name">{currentBg.set}</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	/* Full page structures */
	.login-layout {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		width: 100%;
		overflow-y: auto;
		background: #020205;
		padding: 3rem 1.5rem 1.5rem 1.5rem;
		box-sizing: border-box;
	}

	.blurred-bg {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-size: cover;
		background-position: center;
		filter: blur(100px) brightness(0.18) saturate(0.8);
		opacity: 0.85;
		z-index: 0;
		pointer-events: none;
		transition: background-image 0.6s ease-in-out;
	}

	/* Top Actions Bar */
	.header-actions {
		position: absolute;
		top: 1.25rem;
		right: 1.5rem;
		display: flex;
		gap: 0.75rem;
		z-index: 10;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		padding: 0.5rem 0.875rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		transition: all 0.2s;
	}

	.action-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-primary);
		border-color: rgba(255, 255, 255, 0.15);
		transform: translateY(-1px);
	}

	.action-btn:active {
		transform: translateY(0);
	}

	/* Layout Split & Adaptive logic */
	.adapter-container {
		position: relative;
		z-index: 2;
		display: flex;
		gap: 3.5rem;
		width: 100%;
		max-width: 1200px;
		align-items: center;
		justify-content: center;
		transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Landscape Mode (Wide art) */
	.layout-landscape {
		flex-direction: row;
	}
	.layout-landscape .form-section {
		flex: 1;
		max-width: 440px;
	}
	.layout-landscape .art-section {
		flex: 1.2;
		max-width: 600px;
		display: flex;
		justify-content: center;
	}

	/* Portrait Mode (Tall/Square art) */
	.layout-portrait {
		flex-direction: row;
	}
	.layout-portrait .form-section {
		flex: 1;
		max-width: 440px;
	}
	.layout-portrait .art-section {
		flex: 0.8;
		max-width: 380px;
		display: flex;
		justify-content: center;
	}

	/* Responsiveness */
	@media (max-width: 1023px) {
		.login-layout {
			padding-top: 5rem;
		}
		.adapter-container {
			flex-direction: column-reverse !important;
			gap: 2.5rem;
		}
		.form-section, .art-section {
			width: 100% !important;
			max-width: 440px !important;
		}
		.art-section {
			margin-bottom: 0;
		}
	}

	/* Form Glass Card styling */
	.form-glass-card {
		background: rgba(20, 20, 28, 0.45);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: var(--radius-lg);
		padding: 2.5rem 2.25rem;
		backdrop-filter: var(--glass-blur);
		box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4), var(--inner-glow);
		display: flex;
		flex-direction: column;
		width: 100%;
	}

	.logo {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-bottom: 2rem;
	}
	.logo-text {
		font-size: 1.5rem;
		font-weight: 800;
		letter-spacing: -0.05em;
		color: var(--text-primary);
	}
	.logo-sep {
		font-size: 1.25rem;
		color: rgba(255, 255, 255, 0.15);
	}
	.logo-sub {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--primary));
		letter-spacing: -0.01em;
	}

	/* Tab sliders */
	.tabs-header {
		position: relative;
		display: flex;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: var(--radius-md);
		padding: 4px;
		margin-bottom: 1.75rem;
	}

	.tab-btn {
		flex: 1;
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 0.8125rem;
		font-weight: 600;
		padding: 0.5rem 0;
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
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.08);
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
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	:global(.input-wrapper .input-icon) {
		position: absolute;
		left: 0.875rem;
		color: var(--text-muted);
		pointer-events: none;
		z-index: 2;
	}

	:global(.input-wrapper .ui-input) {
		padding-left: 2.5rem !important;
		padding-right: 2.5rem !important;
		height: 2.5rem !important;
		background-color: rgba(255, 255, 255, 0.02) !important;
		border: 1px solid rgba(255, 255, 255, 0.06) !important;
		border-radius: var(--radius-md) !important;
		font-size: 0.875rem !important;
		width: 100%;
		transition: all 0.2s !important;
	}

	:global(.input-wrapper .ui-input:focus-visible) {
		border-color: hsl(var(--primary)) !important;
		background-color: rgba(0, 0, 0, 0.2) !important;
		box-shadow: 0 0 0 4px hsla(var(--primary-hsl), 0.15) !important;
	}

	.eye-btn {
		position: absolute;
		right: 0.875rem;
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
		height: 2.5rem !important;
		margin-top: 0.5rem;
		font-weight: 600 !important;
		background-color: hsl(var(--primary)) !important;
		color: #ffffff !important;
		border-radius: var(--radius-md) !important;
		transition: all 0.2s !important;
	}

	:global(.auth-form .submit-btn:hover) {
		background-color: hsl(var(--primary) / 0.9) !important;
		box-shadow: 0 0 16px hsla(var(--primary-hsl), 0.3);
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

	/* Divider */
	.divider {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 1.75rem 0;
	}

	.divider::before {
		content: "";
		position: absolute;
		width: 100%;
		height: 1px;
		background: rgba(255, 255, 255, 0.06);
		left: 0;
	}

	.divider-text {
		position: relative;
		background: rgb(18, 18, 25);
		padding: 0 0.75rem;
		font-size: 0.75rem;
		color: var(--text-muted);
		z-index: 2;
		border-radius: 4px;
	}

	/* Social buttons */
	.social-login-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.social-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.05);
		color: var(--text-secondary);
		height: 2.25rem;
		border-radius: var(--radius-md);
		font-size: 0.8125rem;
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

	/* 3D Showcase Card panel */
	.art-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		perspective: 1000px;
	}

	.art-container-scaler {
		position: relative;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.art-card-glow {
		position: absolute;
		width: 96%;
		height: 96%;
		top: 2%;
		left: 2%;
		background-size: cover;
		background-position: center;
		z-index: 1;
		opacity: 0.4;
		border-radius: var(--radius-lg);
		pointer-events: none;
		transition: opacity 0.5s ease;
	}

	.art-card {
		position: relative;
		z-index: 2;
		width: 100%;
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: 
			0 30px 60px rgba(0, 0, 0, 0.6), 
			inset 0 1px 1px 0 rgba(255, 255, 255, 0.1);
		transform-style: preserve-3d;
		transition: box-shadow 0.3s ease, border-color 0.3s ease;
		cursor: default;
		background: #0d0d12;
		border: 1px solid rgba(255, 255, 255, 0.06);
	}

	.art-card::after {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		border-radius: var(--radius-lg);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
		pointer-events: none;
		z-index: 6;
	}

	.art-card.hovering {
		box-shadow: 
			0 40px 80px rgba(0, 0, 0, 0.8), 
			0 0 40px hsla(var(--primary-hsl), 0.25);
		border-color: hsla(var(--primary-hsl), 0.4);
	}

	.card-sheen {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 5;
		background: radial-gradient(
			circle at var(--sheen-x) var(--sheen-y),
			rgba(255, 255, 255, 0.18) 0%,
			rgba(255, 255, 255, 0) 60%
		);
		mix-blend-mode: overlay;
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.art-card.hovering .card-sheen {
		opacity: 1;
	}

	.card-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		opacity: 0;
		transition: opacity 0.5s ease-in-out;
		z-index: 2;
	}

	.card-img.loaded {
		opacity: 1;
	}

	/* Details Placard */
	.art-placard {
		margin-top: 1.5rem;
		background: rgba(15, 15, 22, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: var(--radius-md);
		padding: 0.625rem 1.25rem;
		backdrop-filter: blur(8px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		text-align: center;
		max-width: 85%;
		z-index: 4;
	}

	.card-title {
		color: var(--text-primary);
		letter-spacing: -0.01em;
	}

	.set-name {
		color: var(--text-muted);
		margin-top: 0.125rem;
		font-weight: 500;
	}
</style>
