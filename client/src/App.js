import React, { Component } from 'react';
import './App.css';

const pageSize = 10;

class Variants extends Component {
	render() {
		const variants = this.props.variants;

		return (
			<div className="table-responsive">
				<table className="table">
					<thead>
						<tr>
							<th>Variant</th>
							<th>Inventory</th>
							<th>Price</th>
						</tr>
					</thead>
					<tbody>
						{variants.map(function(variant, index) {
							return (
								<tr key={index} className={variant.inventory_quantity <= 5 ? 'danger' : ''}>
									<td>{variant.title}</td>
									<td>{variant.inventory_quantity}</td>
									<td>{variant.price}</td>
								</tr>
							)
						}, this)}
					</tbody>
				</table>
			</div>
		)
	}
}

class Product extends Component {
	constructor(props) {
		super(props);

		this.handler = this.handler.bind(this);
		this.updateInventoryTotal = this.updateInventoryTotal.bind(this);
	}

	state = {
		slide: false,
		inventoryTotal: 0
	}

	componentDidMount() {
		this.updateInventoryTotal(this.props.product.variants);
	}

	updateInventoryTotal(variants) {
		var sum = 0;

		for(var i = 0; i < variants.length; i++) {
			sum += variants[i].inventory_quantity;
		}

		this.setState({ inventoryTotal: sum });
	}

	handler() {
		if (this.state.slide === true) {
			this.setState({ slide: false });
		} else {
			this.setState({ slide: true });
		}
	}

	render() {
		const product = this.props.product;

		return (
			<div className="product" onClick={this.handler}>
				<div className="product-title">{product.title}</div>
				<div className={this.state.slide ? "product-data slidedown" : "product-data slideup"}>
					<div className="container text-center">
						<div className="row">
							<div className="col-xs-12">
								<p className={this.state.inventoryTotal <= 5 ? 'bold' : ''}>Inventory Total: {this.state.inventoryTotal}</p>
								<Variants variants={product.variants} />
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}
}

class Pagination extends Component {
	constructor(props) {
		super(props);

		this.pageChange = this.pageChange.bind(this);
	}

	state = {
		pages: 0,
		pageElements: [],
		currentPage: 1
	}

	componentDidMount() {
		this.callApi()
			.then(res => this.test(res.count))
			.catch(err => console.error(err));
	}

	test(count) {
		this.setState({ pages: Math.ceil(count / pageSize) });

		var pages = [];

		for (var i = 1; i <= this.state.pages; i++) {
			pages.push(i);
		}

		this.setState({ pageElements: pages });
	}

	callApi = async () => {
		var url = '/products/count';
		const response = await fetch(url, {
			method: "GET",
			credentials: "include"
		});
		const body = await response.json();

		if (response.status !== 200) throw Error(body.message);

		return body;
	}

	pageChange(page) {
		if (page < 1 || page > this.state.pages) {
			return;
		}

		this.setState({ currentPage: page });

		this.props.updateProducts(page);
	}

	render() {
		return (
			<ul className="pagination">
				<li className={this.state.currentPage === 1 ? 'disabled' : ''}><a onClick={() => this.pageChange(1)}>First</a></li>
				<li className={this.state.currentPage === 1 ? 'disabled' : ''}><a onClick={() => this.pageChange(this.state.currentPage - 1)}>Previous</a></li>
				{this.state.pageElements.map(function (page, i) {
					return <li className={this.state.currentPage === page ? 'active' : ''} key={i}><a onClick={() => this.pageChange(page)}>{page}</a></li>
				}, this)}
				<li className={this.state.currentPage === this.state.pages ? 'disabled' : ''}><a onClick={() => this.pageChange(this.state.currentPage + 1)}>Next</a></li>
				<li className={this.state.currentPage === this.state.pages ? 'disabled' : ''}><a onClick={() => this.pageChange(this.state.pages)}>Last</a></li>
			</ul>
		)
	}
}

class App extends Component {
	constructor() {
		super();

		this.updateProducts = this.updateProducts.bind(this);
	}

	state = {
		response: []
	};

	componentDidMount() {
		this.updateProducts(1);
	}

	callApi = async (page) => {
		var url = '/products?pageSize=' + pageSize + '&page=' + page;
		const response = await fetch(url, {
			method: 'GET',
			credentials: 'include'
		});
		const body = await response.json();

		if (response.status !== 200) throw Error(body.message);

		return body;
	}

	updateProducts(page) {
		this.callApi(page)
			.then(res => this.setState({ response: res }))
			.catch(err => console.error(err));
	}

	render() {
		return (
			<div className="App">
				<div className="products">
					{this.state.response.map(function (product, i) {
						return <Product key={i} product={product} />
					})}
				</div>
				<div className="text-center">
					<Pagination updateProducts={this.updateProducts} />
				</div>
			</div>
		);
	}
}

export default App;
