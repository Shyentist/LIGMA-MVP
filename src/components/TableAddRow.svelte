<script>
    export let entry;
    export let disabledInputs;
    export let ignoredInputs;
    export let selectableInputObjects;
</script>

{#each entry as key}
{#if disabledInputs.includes(key)}
<td class="form-field">
    <label for={key}>{key}</label>
    <input type="text" name={key} placeholder="" disabled>
</td>
{:else if !ignoredInputs.includes(key) && Object.keys(selectableInputObjects).includes(key)}
<td class="form-field">
    <label for={key}>{key}</label>
    <select name={key}>
        {#each selectableInputObjects[key] as value}
            <option value={value}>{value}</option>
        {/each}
    </select>
</td>
{:else if !ignoredInputs.includes(key)}
<td class="form-field">
    <label for={key}>{key}</label>
    <input type="text" name={key} placeholder="">
</td>
{/if}
{/each}