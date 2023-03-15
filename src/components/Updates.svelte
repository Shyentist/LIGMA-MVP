<script>
    export let updates;
</script>

<div><h2>Updates</h2></div>

<div class="update-bubble-container">
    {#if updates.length !== 0}
    {#each updates.slice().reverse() as update}
    <div class="update-bubble">
        <img src={`./imgs/${update.subject}.png`} alt={`${update.subject}'s profile picture`}>
        <p><b>{update.subject}</b> {update.action} {update.object}.</p>
    </div>
    {/each}
    {/if}
    <div class="update-bubble">
        <img src={"./imgs/Pico.png"} alt={"Pico's profile picture"}>
        <p><b>Pico</b> created <b>L I G M A</b>. More updates will show here after you, as the user <b>Johnson</b>, have performed some actions.</p>
    </div>
</div>


<style>

    .update-bubble {
        background-color: var(--bg-color);
        border-radius: 9px;
        padding: 9px;
        margin-top: 9px;
        display: flex;
        text-align: left;
    }

    .update-bubble img {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 2px var(--primary-color) solid;
        margin: 9px 18px;
    }

    .update-bubble p {
        width: fit-content;
    }
    
</style>