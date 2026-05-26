<script>
	import { onMount } from "svelte";
	import { fade, slide } from "svelte/transition";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import { BACKGROUNDS } from "$lib/constants/backgrounds.js";
	import { goto } from "$app/navigation";
	import Button from "$lib/components/ui/Button.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import { Eye, EyeOff, ChevronUp } from "lucide-svelte";
	import googleLogo from "$lib/assets/logos/google-logo.svg?raw";
	import discordLogo from "$lib/assets/logos/Discord-Symbol-Blurple.svg?raw";
	import budgieLogo from "$lib/assets/logos/budgie-logo.svg?raw";

	// Toggle email auth panel visibility
	let showEmailForm = $state(false);

	// Auth mode switcher inside collapsible panel: 'login' or 'signup'
	let activeTab = $state("login");

	// Form inputs
	let email = $state("");
	let password = $state("");
	let confirmPassword = $state("");
	let showPassword = $state(false);

	// Error & Loading States
	let errorMessage = $state("");
	let successMessage = $state("");
	let isSubmitting = $state(false);

	// Background index, load check, and aspect-ratio tracking
	let currentBgIndex = $state(0);
	let currentBg = $derived(BACKGROUNDS[currentBgIndex]);
	let isImageLoaded = $state(false);
	let aspectRatio = $state(1.5); // Defaults to landscape
	let formHeight = $state(380);

	onMount(() => {
		// Pick a random background on mount
		currentBgIndex = Math.floor(Math.random() * BACKGROUNDS.length);
	});

	// Reactively check if user gets authenticated and redirect
	$effect(() => {
		if (authStore.isAuthenticated && !authStore.isLoading) {
			goto("/");
		}
	});

	// Reactively detect the background image's natural aspect ratio
	$effect(() => {
		if (currentBg) {
			isImageLoaded = false;
			const img = new Image();
			img.referrerPolicy = "no-referrer";
			img.src = currentBg.url;
			img.onload = () => {
				aspectRatio = img.naturalWidth / img.naturalHeight;
				isImageLoaded = true;
			};
		}
	});

	// Sign In / Sign Up triggers
	/** @param {SubmitEvent} e */
	async function handleSubmit(e) {
		e.preventDefault();
		errorMessage = "";
		successMessage = "";

		if (!email || !password) {
			errorMessage = "Please fill out all fields.";
			return;
		}

		if (activeTab === "signup") {
			if (password !== confirmPassword) {
				errorMessage = "Passwords do not match.";
				return;
			}
			if (password.length < 6) {
				errorMessage = "Password must be at least 6 characters.";
				return;
			}
		}

		isSubmitting = true;

		try {
			const { supabase } = await import("$lib/supabase");

			if (activeTab === "login") {
				const { error } = await supabase.auth.signInWithPassword({
					email,
					password,
				});
				if (error) throw error;
			} else {
				const { error } = await supabase.auth.signUp({
					email,
					password,
					options: {
						emailRedirectTo: `${window.location.origin}/auth/callback`,
					},
				});
				if (error) throw error;
				successMessage =
					"Sign up successful! Please check your email to verify your account.";
			}
		} catch (err) {
			console.error("Auth error:", err);
			const authError = /** @type {any} */ (err);
			errorMessage =
				authError?.message || "An error occurred during authentication.";
		} finally {
			isSubmitting = false;
		}
	}

	async function loginWithOAuth(
		/** @type {'google' | 'discord'} */ provider,
	) {
		errorMessage = "";
		isSubmitting = true;
		try {
			const { supabase } = await import("$lib/supabase");
			const { error } = await supabase.auth.signInWithOAuth({
				provider,
				options: {
					redirectTo: `${window.location.origin}/auth/callback`,
				},
			});
			if (error) throw error;
		} catch (err) {
			console.error(`${provider} OAuth login failed:`, err);
			const oauthError = /** @type {any} */ (err);
			errorMessage =
				oauthError?.message || `Could not start login with ${provider}.`;
			isSubmitting = false;
		}
	}
</script>

<div
	class="login-layout"
	style="grid-template-columns: min(calc((100vh - 1.5rem) * {aspectRatio}), 100vw - 2.25rem - 360px) 1fr;"
>
	<!-- Left Side: Framed Artwork Container -->
	<div class="art-pane">
		{#if currentBg}
			<div class="art-container">
				<img
					src={currentBg.url}
					alt={currentBg.title}
					class="art-image"
					class:loaded={isImageLoaded}
					onload={() => (isImageLoaded = true)}
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
		<!-- Attached top navigation link -->
		<a href="/" class="back-link">
			<span>← Back to deckbuilder</span>
		</a>

		<div
			class="form-container-inner"
			style="--form-height: {formHeight}px;"
		>
			<div class="form-wrapper" bind:clientHeight={formHeight}>
				<!-- Logo Container -->
				<div class="logo-container">
					{@html budgieLogo}
				</div>

				<div class="form-header">
					<h1 class="form-title">Sign in to Budgie</h1>
				</div>

				<!-- Google / Discord OAuth buttons -->
				<div class="social-login-grid">
					<button
						type="button"
						class="social-btn google"
						onclick={() => loginWithOAuth("google")}
						disabled={isSubmitting}
					>
						{@html googleLogo}
						<span>Google</span>
					</button>

					<button
						type="button"
						class="social-btn discord"
						onclick={() => loginWithOAuth("discord")}
						disabled={isSubmitting}
					>
						{@html discordLogo}
						<span>Discord</span>
					</button>
				</div>

				<!-- Secondary Email Authorization Toggle Link -->
				{#if !showEmailForm}
					<div class="email-toggle-container">
						<button
							type="button"
							class="email-toggle-btn"
							onclick={() => (showEmailForm = true)}
						>
							Or sign in with email
						</button>
					</div>
				{/if}

				{#if showEmailForm}
					<div
						class="email-auth-section"
						transition:slide={{ duration: 200 }}
					>
						<!-- Sliding switcher tab header -->
						<div class="tabs-header">
							<button
								class="tab-btn"
								class:active={activeTab === "login"}
								onclick={() => {
									activeTab = "login";
									errorMessage = "";
									successMessage = "";
								}}
							>
								Log In
							</button>
							<button
								class="tab-btn"
								class:active={activeTab === "signup"}
								onclick={() => {
									activeTab = "signup";
									errorMessage = "";
									successMessage = "";
								}}
							>
								Create Account
							</button>
							<div
								class="tab-slider"
								class:slide-right={activeTab === "signup"}
							></div>
						</div>

						{#if errorMessage}
							<div
								class="alert alert-error"
								transition:slide={{ duration: 150 }}
							>
								<p class="text-xs">{errorMessage}</p>
							</div>
						{/if}

						{#if successMessage}
							<div
								class="alert alert-success"
								transition:slide={{ duration: 150 }}
							>
								<p class="text-xs">{successMessage}</p>
							</div>
						{/if}

						<form onsubmit={handleSubmit} class="auth-form">
							<div class="input-field">
								<label for="email" class="input-label"
									>Email address</label
								>
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
								<label for="password" class="input-label"
									>Password</label
								>
								<div class="input-wrapper">
									<Input
										type={showPassword
											? "text"
											: "password"}
										id="password"
										placeholder="Enter your password"
										bind:value={password}
										required
										disabled={isSubmitting}
									/>
									<button
										type="button"
										class="eye-btn"
										onclick={() =>
											(showPassword = !showPassword)}
										title={showPassword
											? "Hide password"
											: "Show password"}
									>
										{#if showPassword}
											<EyeOff size={16} />
										{:else}
											<Eye size={16} />
										{/if}
									</button>
								</div>
							</div>

							{#if activeTab === "signup"}
								<div
									class="input-field"
									transition:slide={{ duration: 150 }}
								>
									<label
										for="confirm-password"
										class="input-label"
										>Confirm password</label
									>
									<div class="input-wrapper">
										<Input
											type={showPassword
												? "text"
												: "password"}
											id="confirm-password"
											placeholder="Confirm your password"
											bind:value={confirmPassword}
											required
											disabled={isSubmitting}
										/>
									</div>
								</div>
							{/if}

							<Button
								type="submit"
								variant="default"
								class="submit-btn"
								disabled={isSubmitting}
							>
								{#if isSubmitting}
									<div class="spinner"></div>
									<span>Processing...</span>
								{:else}
									<span
										>{activeTab === "login"
											? "Sign In"
											: "Create Account"}</span
									>
								{/if}
							</Button>
						</form>

						<!-- Divider & Chevron Toggle Button to collapse the email section -->
						<div class="email-collapse-divider">
							<button
								type="button"
								class="chevron-collapse-btn"
								onclick={() => (showEmailForm = false)}
								aria-label="Hide email option"
							>
								<ChevronUp size={16} />
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.login-layout {
		display: grid;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		background-color: #0d0d0f;
		padding: 0.5rem;
		box-sizing: border-box;
		gap: 0.5rem;
		transition: grid-template-columns 0.4s cubic-bezier(0.25, 1, 0.5, 1);
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
		border-radius: 6px;
		overflow: hidden;
		background-color: #0c0c0e;
		box-shadow: 0 0 32px -8px rgba(0, 0, 0, 1);
	}

	.art-container::after {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		border-radius: 12px;
		pointer-events: none;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
		z-index: 5;
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
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		background: linear-gradient(
				to bottom,
				rgba(255, 255, 255, 0.08),
				rgba(255, 255, 255, 0.05)
			),
			#0d0d0d;
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.08),
			0 0 32px -8px rgba(0, 0, 0, 1);
		border-radius: 6px;
		padding: 2rem;
		overflow-y: auto;
		box-sizing: border-box;
		container-type: size;
	}

	@media (min-width: 861px) {
		.form-pane {
			min-width: 360px; /* Prevent form pane from shrinking below readable size */
		}
	}

	.form-container-inner {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		max-width: 320px;
		min-height: 100%;
		box-sizing: border-box;
		padding: 3rem 0 0 0; /* Ensure space at top when scrolled */
	}

	.form-wrapper {
		width: 100%;
		display: flex;
		flex-direction: column;
		margin-top: auto;
		margin-bottom: clamp(
			1.5rem,
			calc((100cqw - 320px) / 2),
			calc((100cqh - 3rem - var(--form-height, 380px)) / 2)
		);
	}

	.back-link {
		position: absolute;
		top: 2rem;
		left: 2rem;
		display: flex;
		align-items: center;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.8125rem;
		font-weight: 600;
		transition: color 0.15s;
		z-index: 10;
	}

	.back-link:hover {
		color: var(--text-primary);
	}

	/* Logo container */
	.logo-container {
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 2rem auto;
	}

	.logo-container :global(svg) {
		width: 80px;
		height: auto;
		display: block;
	}

	.form-header {
		margin-bottom: 2.5rem;
		text-align: center;
	}

	.form-title {
		font-size: 1.375rem;
		font-weight: 600;
		color: #ffffff;
		letter-spacing: -0.02em;
		margin: 0;
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

	.email-collapse-divider {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-top: 2rem;
		width: 100%;
		mask: linear-gradient(
			to right,
			transparent,
			black 25%,
			black 75%,
			transparent
		);
	}

	.email-collapse-divider::before {
		content: "";
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 1px;
		background: rgba(255, 255, 255, 0.08);
		z-index: 1;
	}

	.chevron-collapse-btn {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 1rem;
		height: 1.5rem;
		background: #0d0d0d;
		border: none;
		border-radius: 0;
		color: var(--text-muted);
		cursor: pointer;
		z-index: 2;
		transition: all 0.2s;
	}

	.chevron-collapse-btn:hover {
		color: var(--text-primary);
		transform: translateY(-1px);
	}

	.email-auth-section {
		display: flex;
		flex-direction: column;
		width: 100%;
		margin-top: 1.75rem;
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

	/* Social buttons (Stacked Vertically, 3rem Tall) */
	.social-login-grid {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
	}

	.social-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		color: var(--text-secondary);
		height: 3rem;
		border-radius: var(--radius-md);
		font-size: 0.9375rem;
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

	.social-btn :global(svg) {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		display: block;
	}

	.discord :global(svg) {
		color: #5865f2;
		transition: color 0.2s;
	}

	.discord:hover :global(svg) {
		color: #7289da;
	}

	.discord:hover {
		background: rgba(88, 101, 242, 0.1);
		border-color: rgba(88, 101, 242, 0.2);
	}

	.google:hover {
		background: rgba(255, 255, 255, 0.06);
	}

	/* Responsive adaptation for narrow screens / tablets / mobile */
	@media (max-width: 860px) {
		.login-layout {
			grid-template-columns: 1fr !important;
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
			border-radius: 6px;
		}

		.art-info {
			bottom: 1.25rem;
			left: 1.25rem;
		}

		.art-artist {
			font-size: 0.625rem;
		}

		.form-pane {
			padding: 0.5rem 1.25rem 2.5rem 1.25rem;
			align-items: center;
			height: auto;
			overflow-y: visible;
			container-type: inline-size;
		}

		.form-container-inner {
			min-height: auto;
		}

		.form-wrapper {
			max-width: 100%;
		}

		.back-link {
			top: 1.5rem;
			left: 1.5rem;
		}
	}
</style>
