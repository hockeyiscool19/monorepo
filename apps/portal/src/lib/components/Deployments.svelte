<script lang="ts">
	// Deployments table + actions + routing alert, rendered from the registry at build time.
	// Markup mirrors reference.html; the only addition is .table-wrap, a labelled scroll region that
	// keeps a five-column table from forcing horizontal page scroll at phone widths.
	import type { DeploymentRow } from '$lib/server/registry';

	let {
		rows,
		routingPending,
		links
	}: {
		rows: DeploymentRow[];
		routingPending: string[];
		links: { registry: string; logs: string; docs: string };
	} = $props();
</script>

<section id="deployments" class="deployments" aria-labelledby="deploy-heading">
	<h2 id="deploy-heading">Recent deployments</h2>
	<!-- A labelled, focusable scroll region is the established pattern for wide tables: without
	     tabindex, keyboard users in browsers that do not auto-focus scrollers (Safari) cannot reach
	     the columns hidden off-screen at phone widths. Svelte's lint cannot see the overflow. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div class="table-wrap" role="region" aria-labelledby="deploy-heading" tabindex="0">
		<table class="table">
			<thead>
				<tr>
					<th scope="col">App</th>
					<th scope="col" class="num">Version</th>
					<th scope="col">Commit</th>
					<th scope="col">Deployed</th>
					<th scope="col">Status</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.id)}
					<tr>
						<td data-label="App">{row.name}</td>
						<td data-label="Version" class="num">{row.version}</td>
						<td data-label="Commit">{#if row.sha}<code>{row.sha}</code>{:else}—{/if}</td>
						<td data-label="Deployed">
							{#if row.deployedAt}<time datetime={row.deployedAt}>{row.deployedLabel}</time>{:else}—{/if}
						</td>
						<td data-label="Status"><span class="badge" data-kind={row.badge.kind}>{row.badge.label}</span></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="actions">
		<a class="btn btn-primary" href={links.registry}>Registry JSON</a>
		<a class="btn btn-secondary" href={links.logs}>Gateway logs</a>
		<a class="btn btn-text" href={links.docs}>Docs</a>
	</div>
	{#if routingPending.length > 0}
		<div class="alert" data-kind="warning" role="status">
			<span class="alert-body">
				<strong>{routingPending.join(', ')}:</strong>
				routing is not ready, so {routingPending.length === 1 ? 'its tile opens' : 'their tiles open'} the Cloud
				Run URL directly.
			</span>
		</div>
	{/if}
</section>
