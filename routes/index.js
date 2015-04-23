var express = require('express');
var router = express.Router();
var moment = require('moment');



module.exports = router;




// =========================================================
// =
// =   SET UP MONGODB AND MONGOOSE
// =

// MongoDB is a JavaScript-oriented database.
// http://docs.mongodb.org/manual/core/crud-introduction/

// --> In Cloud9, you need to start MongoDB before running your app by typing 
// ./mongod 
// at the terminal ("bash" window). But you only need to do that once per workspace. 
// MongoDB should run forever after that.

// Mongoose makes it easy to access MongoDB using a pattern of "models".
// http://mongoosejs.com

// Use Mongoose to connect to the MongoDB database. We'll call our
// database "networks". It will be created automatically if it doesn't already exist.

var mongoose = require('mongoose');
mongoose.connect('mongodb://' + process.env.IP + '/networks');





// =========================================================
// =
// =   DEFINE OUR DATA MODELS
// =

// A Frequency has many Phrases.

var Phrases = new mongoose.Schema({
  sashatext: {type: String},
  created: { type : Date, default: Date.now }
});

var Frequency = mongoose.model('Frequency', {
  interval: {type: Number, required: true},
  duration: {type: Number, required: true},
  privacy: {type: String, required: true},
  user: {type: String},
  created: {type: Date, default: Date.now},
  updated: {type: Date, default: Date.now}, // Last time something was added OR deleted
  completed: {type: Date},
  phrases: [Phrases]
 
});



// =========================================================
// =
// =   INTERVAL-BASED PRUNING
// =

// Call clean() every 5 seconds
setInterval(clean, 5000);

function clean() {
  
  // Find all frequencies (possible improvement: query for frequencies with undefined completion)
  Frequency.find(function(err, frequencies) {
    if (err) {
      console.log('Error finding frequencies to clean', err);
      return;
    }
    
    // Go through each frequency
    for (var i = 0; i < frequencies.length; i++) {
      var frequency = frequencies[i];
      
      // Only work with frequencies that aren't completed
      if (!frequency.completed) {
        
        // See if it should be completed now
        var will_be_completed_at = moment(frequency.created).add(frequency.duration, 'm');
        if (will_be_completed_at.isAfter(moment())) {
          console.log("Completing frequency", frequency.id);
          frequency.completed = Date.now();
          frequency.save(function(err) {
            if (err) {
              console.log('Error completing frequency', frequency, err);
            }
          });
        }
        
        else {
          
          // See if the last updated date is earlier than now minus the interval
          var must_be_updated_since = moment().subtract(frequency.interval, 'm');
          
          if (moment(frequency.updated).isBefore(must_be_updated_since)) {
            console.log("Pruning frequency", frequency.id);
            // Clear the last phrase and save the frequency.
            // Update the timestamp so this can happen again at the next interval for this frequency.
            if (frequency.phrases.length == 0) {
              console.log("-- But frequency has no phrases");
            }
            else {
              frequency.phrases[frequency.phrases.length - 1].sashatext = '';
            }
            frequency.updated = Date.now();
            frequency.save(function(err) {
              if (err) {
                console.log('Error cleaning frequency', frequency.id, err);
              }
            });
          }
          
        }
        
      }
      
    }
    
  });

}





// =========================================================
// =
// =   WEB ROUTES
// =


// HOME PAGE
// /
// Shows _all_ the phrases

router.get('/', function(request, response, toss) {
  
  // TODO: The last frequency usually gets cut off due to scroll bar width
  
  // When the server receives a request for "/", this code runs

  // Find all the Frequency records in the database
  // TODO: Limit to the logged-in user?
  Frequency.find().sort({'_id': -1}).exec(function(err, frequencies) {
    // This code will run once the database find is complete.
    // frequencies will contain a list (array) of all the phrases that were found.
    // err will contain errors if any.

    // If there's an error, tell Express to do its default behavior, which is show the error page.
    if (err) return toss(err);
    
    // Find the most recent frequency. This will always be the one that gets added to.
    if (frequencies[0]) {
      var latest_frequency_id = frequencies[0].id;  
    }
    
    var frequency_width = 100 / frequencies.length;
    if (frequency_width < 15) frequency_width = 15;
    
    
    // The list of frequencies will be passed to the template.
    response.locals.frequencies = frequencies;
    response.locals.latest_frequency_id = latest_frequency_id;
    response.locals.frequency_width = frequency_width;
    response.locals.total_width = frequency_width * frequencies.length;
    
    // layout tells template to wrap itself in the "layout" template (located in the "views" folder).
    response.locals.layout = 'layout';

    // Render the "home" template (located in the "views" folder).
    response.render('home');
    
  });
  
});


// NEW FREQUENCY
// /frequency/new

router.get('/frequency/new', function(request, response) {

  // When the server receives a request for "/frequency/new", this code runs
  
  // Just render a basic HTML page with a form. We don't need to pass any variables.

  response.locals.layout = 'layout';
  response.render('new_frequency');

});


// ABOUT
// /frequency/new

router.get('/about', function(request, response) {

  // When the server receives a request for "/frequency/new", this code runs
  
  // Just render a basic HTML page with a form. We don't need to pass any variables.

  response.locals.layout = 'layout';
  response.render('about');

});


// CREATE FREQUENCY
// /frequency/create

router.get('/frequency/create', function(request, response, toss) {
  
  // TODO: Also delete the latest frequency at this point if it's active (before creating the new one)

  // When the server receives a request for "/frequency/create", this code runs
  
  var frequency = new Frequency({
    interval: request.query.interval,
    duration: request.query.duration,
    privacy: request.query.privacy,
    user: 'TK'
  });
  
  // Now save it to the database
  frequency.save(function(err) {
    // This code runs once the database save is complete

    // An err here can be due to validations
    if (err) return toss(err);
    
    // Go to the new phrase screen for this frequency
    response.redirect('/phrase/new?frequency_id=' + frequency.id)
    
  });

});


// NEW PHRASE
// /phrase/new?frequency_id=123

router.get('/phrase/new', function(request, response) {

  response.locals.layout = 'layout';
  response.locals.frequency_id = request.query.frequency_id;
  response.render('new_phrase');
  
});



// CREATE PHRASE
// /phrase/create
// Normally you get to this page by clicking "Submit" on the /phrase/new page, but
// you could also enter a URL like the above directly into your browser.
// frequency_id must be one of the parameters passed

router.get('/phrase/create', function(request, response, toss) {
  
  response.locals.layout = 'layout';

  // Find the frequency
  Frequency.findOne({_id: request.query.frequency_id}, function(err, frequency) {
    // This code runs once the frequency has been found
    if (err) return toss(err);
    
    // Create the phrase in memory
    frequency.phrases.push({sashatext: request.query.sashatext});
    
    // Update the frequency's timestamp
    frequency.updated = Date.now();
    
    // Save the frequency (also saves the phrase)
    frequency.save(function(err) {
      // This code runs once the database save is complete
  
      // An err here can be due to validations
      if (err) return toss(err);
      
      // Don't render a "thank you" page; instead redirect to the homepage
      response.redirect('/');
      
    });
    
  });
  
});


// LOGIN
// /new

router.get('/login', function(request, response) {

  // When the server receives a request for "/new", this code runs
  
  // Just render a basic HTML page with a form. We don't need to pass any variables.

  response.locals.layout = 'layout';
  response.render('login');
  
  // Please see views/new.hbs for additional comments
  
});

router.get('/deletions', function(request, response) {

  // When the server receives a request for "/new", this code runs
  
  // Just render a basic HTML page with a form. We don't need to pass any variables.

  response.locals.layout = 'deletions';
  response.render('login');
  
  // Please see views/new.hbs for additional comments
  
});

router.get('/current_user_frequencies', function(request, response) {

  // When the server receives a request for "/new", this code runs
  
  // Just render a basic HTML page with a form. We don't need to pass any variables.

  response.locals.layout = 'current_user_frequencies';
  response.render('login');
  
  // Please see views/new.hbs for additional comments
  
});



// ABOUT PAGE
// /about

router.get('/about', function(request, response) {

  // When the server receives a request for "/about", this code runs

  response.locals.layout = 'layout';
  response.render('about');
  
});

