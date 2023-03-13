let ghpages = require('gh-pages');

ghpages.publish(
    'public', // path to public directory
    {
        branch: 'gh-pages',
        repo: 'https://github.com/Shyentist/LIGMA-MVP.git', // Update to point to your repository  
        user: {
            name: 'Pasquale Buonomo', // update to use your name
            email: 'pasqualebuonomo@hotmail.it' // Update to use your email
        }
    },
    () => {
        console.log('Deploy Complete!')
    }
)