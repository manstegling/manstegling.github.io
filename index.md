## LinkBoy

{% include requests.html %}

*This page will provide an interface to the LinkBoy movie discovery service*


#### Search for a file

<<TODO>>

####Find paths

<div>
 <form onsubmit="return postFindPath(this)">
   <div>
    <label for="m1">Movie 1:</label>
    <input type="text" name="m1" id="m1"><br>
  </div>
  <div>
    <label for="m2">Movie 2:</label>
    <input type="text" name="m2" id="m2"><br>
  </div>
    <input type="submit" name="submit" value="Submit">
 </form>
</div>

#### Tune the algorithm to your personal taste

<div>
  <form onsubmit="return postRatings(this)">
    <label for="file">Filename:</label>
    <input type="file" name="file" id="file"><br>
    <input type="submit" name="submit" value="Submit">
  </form>
</div>