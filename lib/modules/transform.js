'use strict';

/** make it its own module */
function HandlebarsHelpers ( ) {

  function json ( context, options ) {
    return options.fn ( JSON.parse ( context ) ) ;
  }

  function speakingurl ( context, options ) {
	var getSlug = require('speakingurl') ;
    return getSlug ( this.label ) ;
  }  

  return {
    json : json,
    speakingurl : speakingurl
  } ;

}

function html ( configuration ) {

  var path = require ('path');

  var Handlebars = require('handlebars') ;
  
  var hogan = require('hogan') ;  

  var _ = require('underscore') ;

  var fs = require('fs') ; 

  var grunt = require('grunt') ;
  
  var htmlminify = require('html-minifier').minify;

  const sourceDir = grunt.option( 'sourceDir' );
  const destinationDir = grunt.option( 'destinationDir' );

  try {
	  
    /** project root directory */
    var root = path.normalize(__dirname + '/../..') ;
    
    /** grunt task configurations */
    var Gruntconfigurations = require( root + '/Gruntconfigurations' ) ;
  
    /** 
     * information about how to render the CSS in this project
     * see: https://github.com/gruntjs/grunt-contrib-sass
     */
    var sassConfiguration = Gruntconfigurations.sass() ;

    /** 
     * information about how to render the JS files in this project
     */
    var jsConfiguration = Gruntconfigurations.js() ;
    
    var htmlminifyConfiguration = Gruntconfigurations.htmlminify() ;

    var source = grunt.file.readJSON ( grunt.option( 'config-file' ) ) ;
    
    var widgets = { } ;
    
    if ( grunt.file.isFile( sourceDir + '/json/widgets.json' ) ) {
      widgets = grunt.file.readJSON ( sourceDir + '/json/widgets.json') ;
    }

    var uncompileTemplate = grunt.file.read ( configuration.template ) ;
    
    var matchWidgetsRegEx = "data-script='(.*)'" ;

    var matchWidgets = uncompileTemplate.match ( matchWidgetsRegEx ) ;
    
    var handlebars_template = Handlebars.compile ( uncompileTemplate ) ;

    var partials = {} ;

    var toJSON = '' ;

    var javascriptString = '' ;

    var handlebarsTemplate = '' ;

    var pages = {} ;
    
    source.url = source.appUrl + configuration.route ;
    
    /** copy all of the page properties in the source */
    _.extend ( source, configuration.data ) ;
    
    /** register Handlebars helpers */
    _.each ( HandlebarsHelpers() , function ( helper , key ) { 
      Handlebars.registerHelper ( key , helper ) ;
    } ) ;
    
    /** string that holds JavaScript and handlebars templates */
    source.closure = '';    

    if ( grunt.file.isDir ( sourceDir + '/json/pages' ) ) {
      var sources = fs.readdirSync ( sourceDir + '/json/pages' ) ;
      for ( var i = 0; i < sources.length ; i++ ) {
        if ( sources[i].match('.json') ) {
          _.extend ( pages, grunt.file.readJSON ( sourceDir + '/json/pages/' + sources[i] ) ) ;
        }
      }
    }
    
    if ( matchWidgets && matchWidgets[0] ) {

      toJSON = JSON.parse( matchWidgets[0].replace(/'/g, '').replace(/data-script=/g, '') ) ;
      
      /** append all the templates to the body */
      _.each ( toJSON.hbs, function ( hbs ) {
      
        if ( grunt.file.isFile(grunt.option( 'sourceDir' ) + '/views/' + hbs.template ) ) {
        
          var rawTemplate = grunt.file.read( grunt.option( 'sourceDir' ) + '/views/' + hbs.template ) ;
          
          var hbsTemplate = hogan.compile ( rawTemplate ) ;
          
      	  var context = {
      	    id : hbs.id ,
      	    appUrl : source.appUrl ,
      	    readiumUrl : source.readiumUrl
      	  } ;
      	  
      	  var renderedTemplate = hbsTemplate.render ( context ) ;
      	  
      	  source.closure += '<script type="text/x-handlebars-template" id="' + hbs.id + '">' + renderedTemplate + '</script>' ;

        }
        
      } ) ;
      
      /** JS files */
      _.each ( toJSON.js, function ( js ) {
      
    	/** 
    	 * the main app Uglify the JavaScript files and copy them from: /source/js to 
    	 * /build/js folder along with the source files. We allow to configure the
    	 * app to use: compressed or expanded (default to expanded for development 
    	 * purposes). The app can also be configure to host the JavaScript files
    	 * "inline" or "external" (default to expanded for development 
    	 * purposes).
    	 * 
    	 * In production enviorments we want to set the app to use the compressed
    	 * Javascript file and host it inline (in the HTML body of the page)
    	 * 
    	 * in order to use Javascripts files, the file must be specify using data script at
    	 * the source element. See example:
    	 * 
    	 * data-script='{ "js" : [ "crossframe.js", "book.js" ] }'
    	 * 
    	 */
        if ( jsConfiguration.js.style == 'compressed' ) {
    	  var js_filename = path.basename ( js , path.extname( js ) ) + '.min' + path.extname ( js ) ;
          if ( grunt.file.isFile ( destinationDir + '/js/' + js_filename ) ) {
            source.closure += '<script defer>' + grunt.file.read( destinationDir + '/js/' + js_filename ) + '</script>' ;
          }
        }
    	else {	  
          if ( grunt.file.isFile ( destinationDir + '/js/' + js ) ) {
            source.closure += '<script src="' + source.appUrl + '/js/' + js + '" defer></script>';
          }
    	}
      } ) ;

    }
    
    /** CSS / SASS */
    if ( sassConfiguration.dist.build === 'external' ) {
      source.css = "<link href='" + source.appUrl + "/css/style.css' rel='stylesheet' type='text/css'>";
    }
    else {
      source.css = "<style>" + grunt.file.read (grunt.option( 'destinationDir' ) + '/css/style.css') + "</style>";
    }
    
    /** array to hold the menu object */
    source.menus = [] ;

    /** build the menu object */
    _.each ( pages , function ( page, index ) {
      if (_.isArray(pages[index].menu)) {
        _.each( pages[index].menu, function ( menu ) {
          source.menus[menu.weight] = {
            label: menu.label,
            status: 'active',
            route: pages[index].route.replace('/index.html', ''),
            page: index,
            weight: menu.weight
          };
        });
      }
    } ) ;
    
    /** clean the menu object of empty values that can "exist" because of weight */
    source.menus = _.reject ( source.menus, function ( menu ) { return _.isUndefined ( menu ) } ) ;
    
    source.widgets = {} ;

    _.each ( widgets, function ( widget, name ) {
      source.widgets[name] = {} ;
      _.extend ( source.widgets[name], widget ) ;
      if ( widget.sourceType === 'json' ) {
    	source.widgets[name].data = grunt.file.readJSON( root + '/' + widget.source ) ;
      }
      else if ( widget.sourceType === 'iframe' ) {
        source.widgets[name].data = { source : source.widgets[name].source }
      }
    } ) ;

    /** this spaghetti maps the widgets to the task and load data Object if type is not local. */
    if ( source.content ) {
      _.each ( source.content, function ( content, a ) {
        _.each ( source.content[a], function ( pane, b ) {
          if ( _.isArray( source.content[a][b].widgets ) ) {
            source.content[a][b].raw = [];
            _.each ( source.content[a][b].widgets, function ( widget, c ) {
              var spaghetti = {};
              var sourceType = widgets[source.content[a][b].widgets[c]].sourceType;
              if ( sourceType === 'json' ) {
                var json_data = grunt.file.readJSON( root + '/' + widgets[source.content[a][b].widgets[c]].source ) ;
                spaghetti =  {
                  label : widget, 
                  widget : widgets[source.content[a][b].widgets[c]] , 
                  data : json_data                          
                } ;
              }
              /** if you care about placement in specific scenario */
              source.content[a][b][widget] = spaghetti;
              /** as array to loop by weight */
              source.content[a][b].raw.push ( spaghetti );
            });
          }
        });
      });
    }
    
    grunt.file.recurse ( sourceDir + '/views/', function callback (abspath, rootdir, subdir, filename ) {
      if ( filename.match(".mustache") && ! filename.match ( 'htaccess.mustache' ) && configuration.template !== filename ) {
        var name = filename.replace(".mustache", "");
        var partial = grunt.file.read ( abspath ) ;
        var matchWidgetsRegEx = "data-script='(.*)'";
        var matchWidgets = partial.match( matchWidgetsRegEx );
        var toJSON = '';
        var javascriptString = '';
        var closure = '';
        if ( !_.find( _.keys ( pages ), name ) ) {
          if ( matchWidgets && matchWidgets[0] ) {
            toJSON = matchWidgets[0];
            toJSON = toJSON.replace(/'/g, '').replace(/data-script=/g, '');
            toJSON = JSON.parse(toJSON);
            _.each ( toJSON.js, function ( js ) {
              if ( jsConfiguration.js.style == 'compressed' ) {
            	var js_filename = path.basename ( js , path.extname( js ) ) + '.min' + path.extname ( js ) ;
                if ( grunt.file.isFile ( grunt.option( 'destinationDir' ) + '/js/' + js_filename ) ) {
                  javascriptString += '<script>' + grunt.file.read( grunt.option( 'destinationDir' ) + '/js/' + js_filename ) + '</script>' ;
                }
              }
              else {
                if ( grunt.file.isFile( grunt.option( 'destinationDir' ) + '/js/' + js ) ) {
                  javascriptString += '<script src="' + source.appUrl + '/js/' + js + '"></script>';
                }
              }
            } ) ;
          }
          partials[name] = partial + javascriptString;
        }
      }
    } ) ;

    grunt.file.recurse ( sourceDir + '/views/', function callback(abspath, rootdir, subdir, filename ) {
      if ( filename.match('.hbs') ) {
        grunt.file.write ( grunt.option( 'destinationDir' ) + '/js/' + filename, grunt.file.read( abspath ) ) ;
      }
    });

    _.each ( partials, function ( partial, key, list ) { Handlebars.registerPartial( key, partial ) ; } ) ;
            
    var traceName = configuration.route.replace('/index.html', '').replace(/\//g, '-').replace(/-/, '') ;

    var rewriteBase = hogan.compile ( grunt.file.read ( sourceDir + '/views/htaccess.mustache' ) ) ;
    
    var rewriteBasePath = source.appRoot + configuration.route.replace('/index.html' , '' ) ;

    var htaccessFilename = grunt.option( 'destinationDir' ) + configuration.route.replace('/index.html' , '') + '/.htaccess' ;

    /** leave data behind */    
    grunt.file.write( sourceDir + '/json/datasources/' + traceName + '.json', JSON.stringify ( source ) ) ;

    /** write .htaccess file */ 
    if ( rewriteBasePath ) {
      grunt.file.write ( htaccessFilename , rewriteBase.render ( { rewriteBase : rewriteBasePath  } ) ) ;  
    }        
    
    /** write HTML file */
    grunt.file.write( grunt.option( 'destinationDir' ) + '' + configuration.route, htmlminify ( handlebars_template ( source ), htmlminifyConfiguration ) ) ;
            
    grunt.log.write('Transforming ' + configuration.route).ok() ;

  }
  
  catch ( err ) {
    grunt.log.write('Transforming ' + configuration.task + ' into HTML fail. See ' + err.description).error() ;
    console.log ( err ) ;
  }

}

exports.html = html;
