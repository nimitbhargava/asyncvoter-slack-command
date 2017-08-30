const request = require('request')

const clientId = process.env.CLIENT_ID
const clientSecret = process.env.CLIENT_SECRET

var scmp = require('scmp');

function verifyAuthentic(msg, token) {
  // Safe constant-time comparison of token
  return scmp(msg.token, token);
}

module.exports = (app, repository) => {

  app.get('/', (req, res) => {
    res.render('index', { client_id: clientId })
  })

  app.get('/oauth', (req, res) => {
    console.log('/oauth')
    console.log(req)
    if (!req.query.code) {
      res.status(500)
      res.send({ 'Error': "Looks like we're not getting code." })
    } else {
      request({
        url: 'https://slack.com/api/oauth.access',
        qs: { code: req.query.code, client_id: clientId, client_secret: clientSecret },
        method: 'GET'
      }, (error, response, body) => {
        if (error) {
          res.status(500)
          res.send({ 'Error': error })
        } else {
          res.redirect('/')
        }
      })
    }
  })

  app.post('/commands', (req, res) => {
    console.log('/commands')
    console.log(req.body)

    if(!verifyAuthentic(req.body, process.env.VALIDATION_TOKEN)) {
      logger.error("Called with wrong verification token");
      res.status(403).send("Not called by Slack");
      return;
    }

    const text = req.body.text
    const channel_id = req.body.channel_id

    // TODO: Close previous session. One session per channel is allowed.
    repository.del(channel_id, (err, reply) => {
      // TODO: Save unique voting session. Team + Channel
      repository.set(channel_id, JSON.stringify({}), (err, reply) => {
        res.send(formatStart(text))
      })
    })
  })

  app.post('/actions', (req, res) => {
    console.log('/actions')
    console.log(req.body)

    if(!verifyAuthentic(req.body, process.env.VALIDATION_TOKEN)) {
      logger.error("Called with wrong verification token");
      res.status(403).send("Not called by Slack");
      return;
    }

    const payload = JSON.parse(req.body.payload)

    const actions = payload.actions
    const text = payload.original_message.text
    const user = payload.user.name
    const channel_id = payload.channel.id

    repository.get(channel_id, (err, reply) => {
      const votes = JSON.parse(reply) || {}

      if (actions[0].value === 'reveal') {
        res.send(formatResult(text, votes))
      } else {
        // TODO: Count vote for different voting sessions

        votes[user] = actions[0].value

        repository.set(channel_id, JSON.stringify(votes), (err, reply) => {
          res.send(formatRegister(text, votes))
        })
      }
    })
  })

  const formatStart = (text) => {
    const msg = {
      'response_type': 'in_channel',
      'text': `<!here> ASYNC VOTE on "${text}"`,
      'attachments': [{
        'text': 'Please choose a difficulty',
        'fallback': 'Woops! Something bad happens!',
        'callback_id': 'voting_session',
        'color': '#3AA3E3',
        'attachment_type': 'default',
        'actions': [{
          'name': 'Simple',
          'text': 'Simple',
          'type': 'button',
          'value': 'Simple'
        }, {
          'name': 'Medium',
          'text': 'Medium',
          'type': 'button',
          'value': 'Medium'
        }, {
          'name': 'Hard',
          'text': 'Hard',
          'type': 'button',
          'value': 'Hard'
        }, {
          'name': 'No-opinion',
          'text': 'No-opinion',
          'type': 'button',
          'value': 'No-opinion'
        }]
      }]
    }

    return msg
  }

  const formatResult = (text, votes) => {

    const result = Object.keys(votes).map((user) => {
      return `\n@${user} ${votes[user]}`
    })

    const msg = {
      'response_type': 'in_channel',
      'text': `${text} \n${result}`
    }

    return msg
  }

  const formatRegister = (text, votes) => {

    // A set of all users who have voted
    const users = Object.keys(votes).map((user) => {
      return "@" + user
    })


    const msg = {
      'response_type': 'in_channel',
      'text': text,
      'attachments': [{
        'text': `${users.length} vote(s) so far [${users}]`,
        'fallback': 'Woops! Something bad happens!',
        'callback_id': 'voting_session',
        'color': '#3AA3E3',
        'attachment_type': 'default',
        'actions': [{
          'name': 'Simple',
          'text': 'Simple',
          'type': 'button',
          'value': 'Simple'
        }, {
          'name': 'Medium',
          'text': 'Medium',
          'type': 'button',
          'value': 'Medium'

        }, {
          'name': 'Hard',
          'text': 'Hard',
          'type': 'button',
          'value': 'Hard'
        }, {
          'name': 'No-opinion',
          'text': 'No-opinion',
          'type': 'button',
          'value': 'No-opinion'
        }, {
          'name': 'reveal',
          'text': 'Reveal',
          'style': 'danger',
          'type': 'button',
          'value': 'reveal',
          'confirm': {
            'title': 'Are you sure?',
            'text': 'This will reveal all the votes',
            'ok_text': 'Yes',
            'dismiss_text': 'No'
          }
        }]
      }]
    }

    return msg
  }
}
