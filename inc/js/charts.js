function rand(min, max) {
	return Math.floor((Math.random() * max) + min);
}

function chart_mkHourly() {
	var chart = new AmCharts.AmSerialChart();
	chart.dataDateFormat = "YYYY-MM-DD HH";

	chart.categoryAxis.parseDates = true;
	chart.categoryAxis.minPeriod = "hh";
	chart.categoryAxis.showFirstLabel = true;
	chart.categoryAxis.dateFormats = [
		{period:'fff',format:'JJ:NN:SS'},
		{period:'ss',format:'JJ:NN:SS'},
		{period:'mm',format:'JJ:NN'},
		{period:'hh',format:'L A'},
		{period:'DD',format:'MMM DD'},
		{period:'WW',format:'MMM DD'},
		{period:'MM',format:'MMM'},
		{period:'YYYY',format:'YYYY'}
	];
	chart.startDuration = .2;
	chart.prefixesOfBigNumbers = [
	{number:1e+3,prefix:"k"},
	{number:1e+6,prefix:"M"}
	];
	chart.usePrefixes = true;

	return chart;
}

function chart_ImpressionClicks(chartData) {
	var chart = chart_mkHourly();

	chart.dataProvider = chartData;
	chart.categoryField = "Time";
	chart.valueAxes = [
	{ id: "Impressions", position: "left" },
	{ id: "Clicks", position: "right", minMaxMultiplier: 2.2, minimum: 0, includeGuidesInMinMax: true }
	];

	var imps = new AmCharts.AmGraph();
	imps.valueField = "Impressions";
	imps.type = "column";
	imps.fillAlphas = 0.8;
	imps.lineBorder = 0;
	imps.lineThickness = 0;
	imps.fillColors = "#3EBE9B";
	imps.valueAxis = "Impressions";
	imps.balloonText = "[[value]] Impressions";
	chart.addGraph(imps);

	var clicks = new AmCharts.AmGraph();
	clicks.valueField = "Clicks";
	clicks.type = "line";
	clicks.lineThickness = 3;
	clicks.bullet = "round";
	clicks.lineColor = "#FF3B2F";
	clicks.valueAxis = "Clicks";
	clicks.balloonText = "[[value]] Clicks";
	clicks.guides = [];
	chart.addGraph(clicks);

	chart.write('dashstats');
}

function chart_SpendRevenue(chartData) {
	var chart = chart_mkHourly();
	chart.dataProvider = chartData;
	chart.categoryField = "Time";

	var spend = new AmCharts.AmGraph();
	spend.valueField = "Spend";
	spend.type = "column";
	spend.stackable = false;
	spend.clustered = false;
	spend.fillAlphas = 0.8;
	spend.lineBorder = 0;
	spend.lineThickness = 0;
	spend.fillColors = "#FF3B2F";
	spend.valueAxis = "Spend";
	spend.balloonText = "$[[value]] Spend";
	chart.addGraph(spend);

	var revenue = new AmCharts.AmGraph();
	revenue.valueField = "Revenue";
	revenue.type = "column";
	revenue.stackable = false;
	revenue.clustered = false;
	revenue.fillAlphas = 0.8;
	revenue.lineBorder = 0;
	revenue.lineThickness = 0;
	revenue.fillColors = "#3EBE9B";
	revenue.valueAxis = "Revenue";
	revenue.balloonText = "$[[value]] Revenue";
	chart.addGraph(revenue);


	chart.write('dashstats');
}
