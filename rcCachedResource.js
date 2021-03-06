(function (root, factory) {
    'use strict';

    if (typeof define === 'function' && define.amd) {
        define(['angular'], factory);
    } else if (root.hasOwnProperty('angular')) {
        // Browser globals (root is window), we don't register it.
        factory(root.angular);
    } else if (typeof exports === 'object') {
        module.exports = factory(require('angular'));
    }
    
} (this, function (angular) {
    'use strict';
    var _DEBUG = false;
    function isFunction(functionToCheck) {
        var getType = {};
        return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
    }
    function CacheEntry(url, params, actions, cacheParams, $localStorage, $q, $resource, $log, $timeout) {
        this.res = $resource(url, params, actions);
        this.cacheTimeout = cacheParams.cacheTimeout * 1000 * 60;//minutes
        if (!this.cacheTimeout) {
            this.cacheTimeout = -1;
        }
        this.cacheHalfLife = cacheParams.cacheHalfLife;

        this.name = cacheParams.name;
        if (this.name == null || this.name.length == 0) {
            throw "Cache name is mandatory";
        }


        var forEach = angular.forEach;
        var me = this;
        if (!$localStorage[this.name]) {
            if (_DEBUG) {
                $log.debug("creating cached resource", url, this.name, this.cacheTimeout);
            }
            $localStorage[me.name] = {};
        }
        this.clear = function () {
            if (_DEBUG) {
                $log.log("Limpando cache", me.name);
            }
            delete $localStorage[me.name];
            $localStorage[me.name] = {};
        }
        if (!actions["get"]) {
            actions["get"] = { method: 'GET' };
        }
        if (!actions["query"]) {
            actions["query"] = { method: 'GET', isArray: true };
        }
         
         
         forEach(actions, function (action, nameFct) {
             me[nameFct] = function (a, b) {
                 if (isFunction(a) == true) {
                     $log.warn("param a is a function");
                 }
                 if (isFunction(b) == true) {
                     $log.warn("param b is a function");
                 }
                 var deferred = $q.defer();
                 if (nameFct != 'get' && nameFct != 'query' && action.method != 'GET') {
                     $log.error("NOT a GET method, execute action ", action, "name", nameFct);
                     me.res[nameFct](a, b,
                         function (data) {
                             deferred.resolve(data);
                         },
                         function (err) {
                             deferred.reject(err);
                         }
                         )
                     return deferred.promise;
                 };


                 var cacheName = nameFct;
                 var cacheParams = action.cr;
                 if (!cacheParams) {
                     cacheParams = {};
                 }
                 if (cacheParams.cacheName) {
                     cacheName = cacheParams.cacheName(a);
                     $log.debug(cacheName, me.name);
                 }
                 var cache = $localStorage[me.name][cacheName];

                 var checkValidity = function (cacheEntry) {
                     var timeout = me.cacheTimeout;
                     if (cacheParams.isCacheValid) {
                         if (_DEBUG) {
                             $log.debug("   using cr_isCacheValid function timeout");
                         }
                         return cacheParams.isCacheValid(cacheEntry, params);
                     } else if (cacheParams.timeout) {
                         if (_DEBUG) {
                             $log.debug("   using actions timeout", (cacheParams.timeout / 1000) + "s");
                         }
                         timeout = cacheParams.timeout;
                     } else {
                         if (_DEBUG) {
                             $log.debug("   using def constructor timeout", (timeout / 1000) + "s");
                         }
                     }

                     return (timeout <= 0 || ((new Date().getTime() - cache.date) < timeout));
                 }
                 var reloadCache = function (executeCallback, onFailure) {

                     try {
                         me.res[nameFct](a, b,
                             function (data) {
                                 if (_DEBUG) {
                                     $log.debug("Storing '" + "(" + me.name + "." + cacheName + ")' ", $localStorage[me.name][cacheName])
                                 }
                                 var cacheData = {
                                     data: data,
                                     date: new Date().getTime()
                                 }
                                 $localStorage[me.name][cacheName] = cacheData;

                                 if (executeCallback) {
                                     deferred.resolve(data);
                                 }
                             }, function (error) {
                                 if (_DEBUG) {
                                     $log.warn("Failed to load from server:" + JSON.stringify(error) + " - " + url + " => " + action.url + " params " + JSON.stringify(a) + " and " + JSON.stringify(b));
                                 }
                                 if (executeCallback) {
                                     if (onFailure != null) {
                                         if (_DEBUG) {
                                             $log.log("Returning previously cached");
                                         }
                                         deferred.resolve(onFailure)
                                     } else {
                                         deferred.reject(error);
                                     }
                                 }
                             });
                     } catch (e) {
                         $log.log("erro creating cache " + JSON.stringify(e));
                     }
                 };
                 if (cache && cache.data != null) {
                     //check if it's expired
                     if (checkValidity(cache) == true) {
                         if (_DEBUG) {
                             $log.debug("Cache hit '" + (cacheName) + "'");
                         }
                         deferred.resolve(cache.data);
                         if (cacheParams.cacheHalfLife && cacheParams.cacheHalfLife(cache)) {
                             if (_DEBUG) {
                                 $log.debug("Cache halflife reached");
                             }
                             reloadCache(false);
                         }
                     } else {
                         if (_DEBUG) {
                             $log.debug("Cache expired '" + (cacheName) + "'");
                         }
                         reloadCache(true, cache.data);
                     }


                 } else {
                     if (_DEBUG) {
                         $log.debug("Cache miss '" + (cacheName) + "'");
                     }
                     reloadCache(true);
                 }
                  
                 
                 return deferred.promise;

             }
         });
        
    };
    // In cases where Angular does not get passed or angular is a truthy value
    // but misses .module we can fall back to using window.
    angular = (angular && angular.module) ? angular : window.angular;

    /**
     * @ngdoc overview
     * @name ngStorage
     */

    return angular.module('rcCachedResource', ['ngStorage', 'ngResource'])

    

        .provider('$cachedResource', _cachedStorageProvider())
    function _cachedStorageProvider() {
        return function () {
            this.$get = [
                '$rootScope',
                '$window',
                '$log',
                '$timeout',
                '$document',
                '$localStorage',
                '$resource',
                '$q',
                function (
                    $rootScope,
                    $window,
                    $log,
                    $timeout,
                    $document,
                    $localStorage,                    
                    $resource,
                    $q
                    ) {                       
                        function cachingFactory(url,params,actions,cacheParams) {                            
                            return new CacheEntry(url,params,actions,cacheParams,$localStorage,$q,$resource,$log,$timeout);
                        }
                 
                    return cachingFactory;
                }
            ]};
    }
}));
