---
---

<link rel="stylesheet" href="/assets/css/style.css">
<link rel="stylesheet" href="/assets/css/styles.css">

## LinkBoy

{% include requests.html %}

*This page will provide an interface to the LinkBoy movie discovery service*


#### Search for a movie

<div>
  <div class="row">
    <div class="col-md-12 col-lg-4">
      <input type="text" class="form-control" id="m0" placeholder="Star Wars">
    </div>
    <div class="col-md-2 col-lg-1">
	  <button type="submit" class="btn btn-primary" id="b0" onclick="postFindMovie()">Search</button>
	</div>
  </div>
</div>

<span id="searchResult"></span>

#### Find paths

<div>
  <div class="row">
    <div class="col-md-6 col-lg-2">
      <input type="text" class="form-control" id="m1" placeholder="Star Wars">
    </div>
	<div class="col-md-6 col-lg-2">
      <input type="text" class="form-control" id="m2" placeholder="The Notebook"><br>
	</div>
	<div class="col-md-2 col-lg-1">
	  <button type="submit" class="btn btn-primary" id="b1" onclick="postFindPath()">Find</button>
	</div>
  </div>
</div>

<span id="pathResult"></span>

#### Tune the algorithm to your personal taste

<div>
  <form onsubmit="return postRatings(this)">
    <div class="row">
      <div class="col-md-12 col-lg-4">
        <input class="form-control" type="file" id="f1">
      </div>
      <div class="col-md-2 col-lg-1">
        <button type="submit" class="btn btn-primary" id="b2">Tune</button>
      </div>
    </div>
  </form>
</div>