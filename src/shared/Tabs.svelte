<script>
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher()
    export let groups;
    export let activeGroup;
</script>

<div class="tabs">
    <ul>
        { #each groups as group }
            <div  class="dropdown">
                <li class:active={activeGroup === group.name}>{ group.name }</li>
                <ul class="dropdown-content">
                { #each group.tabs as tab}
                    <li on:click={() => dispatch('tabChange', {group: group.name, tab: tab})}>{tab}</li>
                { /each}
            </ul>
            </div>
            
        {/each}
    </ul>
</div>

<style>

.active {
    color: var(--primary-color);
    border-bottom: 2px solid var(--primary-color);
}

ul {
    display: flex;
    justify-content: center;
    padding: 0;
    list-style-type: none;
}

li {
    padding: 3px 12px;
    font-weight: bold;
}

@media (hover: hover) {
	.dropdown-content {
		display:none;
	}
	.dropdown:hover .dropdown-content {
		display:list-item;
        position: absolute;
        background-color: var(--bg-color);
        border-radius: 3px;
        padding: 3px;
	}

    .dropdown:hover .dropdown-content li:hover {
        background-color: lightgray;
    }
}
</style>