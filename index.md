---
layout: default
title: Tech nuggets
---

<link rel="stylesheet" href="/assets/css/style.css">
<link rel="stylesheet" href="/assets/css/styles.css">

## Welcome

_Here at motility.se you can find interesting tech-related items. Enjoy!_


<hr class="hr" />


### Linkboy

{% include requests.html %}

Discovering new movies is exciting. Even better if the discovered movies are surprisingly good. I've been playing around with some ideas for generating _better_ recommendations.
By better I mean not just movies that are almost the same as the ones you've already come to love. Rather, I want to find movies that (on the surface) look very different, yet 
share the same "hidden qualities" that will make you love them.

The theory behind the recommendations engine is explained [here](https://github.com/manstegling/linkboy/blob/master/doc/DOCUMENTATION.md) and the repo and how to run
locally is available on [Linkboy's GitHub](https://github.com/manstegling/linkboy).


##### Search for a movie

To use the recommendation engine you'll need to refer to movies by their corresponding `movieId`. This can be found using this search functionality.
Simply search for the movie using the whole or a part of the title.

<div>
  <div class="row">
    <div class="col-md-12 col-lg-8">
      <input type="text" class="form-control" id="m0" placeholder="Star Wars">
    </div>
    <div class="col-md-2 col-lg-1">
	  <button type="submit" class="btn btn-primary" id="b0" onclick="postFindMovie()">Search</button>
	</div>
  </div>
</div>

<span id="searchResult"></span>

##### Find paths

Taste is dynamic. What you like depends on your frame of reference. To fully appreciate a movie, it may be better to watch some other movies first. If you enter the movieIds of two
movies below you'll get a suggestion on movies to see (in order) to better appreciate the target movie.


<div>
  <div class="row">
    <div class="col-md-12 col-lg-4">
      <input type="text" class="form-control" id="movieId1" placeholder="260">
    </div>
	<div class="col-md-12 col-lg-4">
      <input type="text" class="form-control" id="movieId2" placeholder="41912"><br>
	</div>
	<div class="col-md-4 col-lg-2">
	  <button type="submit" class="btn btn-primary" id="b1" onclick="postFindPath()">Find</button>
	</div>
  </div>
</div>

<span id="pathResult"></span>

##### Tune the algorithm to your personal taste

The recommendation engine operates on a generic taste profile. To generate better recommendations you can tune it using your own MovieLens ratings. If you're using MovieLens,
navigate to [export your data](https://movielens.org/profile/settings/import-export) and click 'export ratings'. Then upload the resulting file to Linkboy using the file chooser below. You remain entirely
anonymous and the only reference to your tuned recommendations is a randomly generated key.

<div>
  <form onsubmit="return postRatings(this)">
    <div class="row">
      <div class="col-md-12 col-lg-8">
        <input class="form-control" type="file" id="f1">
      </div>
      <div class="col-md-2 col-lg-1">
        <button type="submit" class="btn btn-primary" id="b2">Tune</button>
      </div>
    </div>
  </form>
</div>


<hr class="hr" />

<span id="randomKey"></span>


### Ziploq

Do you work in Java? Ever wanted to merge and seqence data from multiple sources?

![Ziploq; merging input sources](https://raw.githubusercontent.com/manstegling/ziploq/master/images/ziploq.png)

[Ziploq](https://github.com/manstegling/ziploq) is a lightweight message-synchronization device with ultra-high performance. It lets you quickly merge data from any
number of data sources reactively, without having to reach for large frameworks such as _Project Reactor_ or _Akka Streams_. It doesn't matter whether the input
data is ordered or not, the output will always be ordered! When dealing with external systems please note that data transmission delays and disconnections are all
handled automatically out-of-the-box, too!

Ziploq is built with infinite real-time data sequences in mind, but works just as well for in-memory datasets. This design results in a low memory footprint and a high
message throughput. Simple, reliable and fast.



