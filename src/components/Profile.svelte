<script>
    const biography = `I am a poison dart frog. My family and I are endemic to humid, tropical environments of Central and South America, mostly from their tropical rainforests. 

They call us "poison dart frogs" due to the Native Americans' use of our toxic secretions to poison the tips of their blowdarts. However, out of over 170 species, only four, larger in size and with higher levels of toxicity, have been documented as being used for this purpose. The most poisonous of us have enough toxin on average to kill ten to twenty men or about twenty thousand mice. Still, we are also making progresses in medicine. In fact, some chemicals extracted from the skin of some of us may have medicinal value, mostly as muscle relaxants, heart stimulants, and appetite suppressants. One such chemical is a painkiller 200 times as potent as morphine, called epibatidine...however, the therapeutic dose is very close to the fatal dose!

I am one of those species who actually produce very little, if any, toxins, but still retains the flamboyant skin colors to tell people to bug off and respect our personal space, so you can lick me safely...kinda.

Some of us, like me, had to leave their native land because of the rampant habitat loss, while some others were caught, sold, and deported as pets, so it is no surprise that some species of poison dart frogs are listed as threatened or endangered as a result.`

const url = "https://www.eol.org/pages/1554"
</script>

<div><h2>Profile</h2></div>

<div class="profile-sheet">
    <div class="profile-info">
        <div class="name-and-surname">
            <div>
            <b>Name:</b>
            <input type="text" disabled placeholder={"Johnson"}>
            </div>
            <div>
            <b>Surname:</b>
            <input type="text" disabled placeholder={"The Poison Dart Frog"}>
            </div>
        </div>
        <div class="biography">
            <b>Biography:</b>
            <textarea rows="10" style="width:100%;" disabled>{biography}</textarea>
            <a href={url} target="_blank" rel="noreferrer noopener"><button>Learn more</button></a>
        </div>
    </div>
    <div class="profile-picture">
        <img src="./imgs/Johnson.png" alt="Johnson's profile picture">
    </div>    
</div>

<style>
    .profile-sheet {
        width:90%;
        margin: 0 5%;
        background: var(--bg-color);
        display: flex;
        border-radius: 9px;
        padding: 9px;
    }

    .profile-info {
        width: 75%;
        margin: 9px;
    }

    .profile-picture {
        width: 15%;
        margin: 2.5%;
    }

    .profile-picture img {
        width:100%;
        border-radius: 50%;
        border: 4px var(--primary-color) solid;
    }

    .name-and-surname div {
        width:100%;
        text-align: left;
    }

    @media (min-width: 600px) {
        .name-and-surname div {
            display: inline-block;
            width:50%;
            display: flex;
            align-items: center;
    }

        .name-and-surname {
            display: flex;
        }
    }

    .biography {
        text-align: left;
        margin-top: 10px;
    }

    .biography, .name-and-surname {
        padding: 10px;
    }

    input {
        margin: 0px;
        width: 100%;
    } 
</style>